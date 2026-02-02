from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.sql import func
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional, List
from functools import lru_cache
import enum
import io
import csv

# Settings
class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./legal_timer.db"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()

# Database
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Models
class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"

class TaskStatus(str, enum.Enum):
    OPEN = "open"
    COMPLETED = "completed"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    timezone = Column(String, default="UTC")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    tasks = relationship("Task", back_populates="user")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, default="#6366f1")
    tasks = relationship("Task", back_populates="category")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)
    category_id = Column(Integer, ForeignKey("categories.id"))
    matter = Column(String)
    status = Column(Enum(TaskStatus), default=TaskStatus.OPEN, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    user = relationship("User", back_populates="tasks")
    category = relationship("Category", back_populates="tasks")
    sessions = relationship("TaskSession", back_populates="task")

class TaskSession(Base):
    __tablename__ = "task_sessions"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True))
    duration_seconds = Column(Integer, default=0)
    task = relationship("Task", back_populates="sessions")

# Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    matter: Optional[str] = None

class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    matter: Optional[str]
    status: TaskStatus
    created_at: datetime
    total_duration: int = 0
    is_running: bool = False
    
    class Config:
        from_attributes = True

# Auth
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")

# App
app = FastAPI(title="Legal Task Timer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
Base.metadata.create_all(bind=engine)

# Seed categories
@app.on_event("startup")
def startup():
    db = SessionLocal()
    if db.query(Category).count() == 0:
        categories = [
            Category(name="Contract Review", color="#6366f1"),
            Category(name="Legal Research", color="#8b5cf6"),
            Category(name="Compliance", color="#ec4899"),
            Category(name="Litigation", color="#ef4444"),
            Category(name="Corporate", color="#f59e0b"),
        ]
        db.add_all(categories)
        db.commit()
    db.close()

# Routes
@app.post("/auth/register")
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name
    )
    db.add(user)
    db.commit()
    return {"message": "User created"}

@app.post("/auth/login", response_model=Token)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email, "full_name": current_user.full_name}

@app.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).all()

@app.post("/tasks", response_model=TaskResponse)
def create_task(task_data: TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = Task(
        user_id=current_user.id,
        title=task_data.title,
        description=task_data.description,
        category_id=task_data.category_id,
        matter=task_data.matter
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@app.get("/tasks", response_model=List[TaskResponse])
def get_tasks(status: Optional[TaskStatus] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Task).filter(Task.user_id == current_user.id)
    if status:
        query = query.filter(Task.status == status)
    tasks = query.order_by(Task.created_at.desc()).all()
    
    result = []
    for task in tasks:
        sessions = db.query(TaskSession).filter(TaskSession.task_id == task.id).all()
        total_duration = sum(s.duration_seconds for s in sessions)
        is_running = any(s.end_time is None for s in sessions)
        
        task_dict = TaskResponse.model_validate(task).model_dump()
        task_dict["total_duration"] = total_duration
        task_dict["is_running"] = is_running
        result.append(TaskResponse(**task_dict))
    
    return result

@app.post("/tasks/{task_id}/start")
def start_timer(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Auto-stop running session
    running = db.query(TaskSession).filter(
        TaskSession.user_id == current_user.id,
        TaskSession.end_time.is_(None)
    ).first()
    
    stopped_task = None
    if running:
        running.end_time = datetime.utcnow()
        running.duration_seconds = int((running.end_time - running.start_time).total_seconds())
        stopped_task = db.query(Task).filter(Task.id == running.task_id).first()
    
    # Start new session
    session = TaskSession(
        task_id=task_id,
        user_id=current_user.id,
        start_time=datetime.utcnow()
    )
    db.add(session)
    db.commit()
    
    response = {"message": "Timer started"}
    if stopped_task:
        response["stopped_task"] = {"id": stopped_task.id, "title": stopped_task.title}
    return response

@app.post("/tasks/{task_id}/stop")
def stop_timer(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(TaskSession).filter(
        TaskSession.task_id == task_id,
        TaskSession.user_id == current_user.id,
        TaskSession.end_time.is_(None)
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="No running timer")
    
    session.end_time = datetime.utcnow()
    session.duration_seconds = int((session.end_time - session.start_time).total_seconds())
    db.commit()
    return {"message": "Timer stopped"}

@app.get("/tasks/active")
def get_active_task(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(TaskSession).filter(
        TaskSession.user_id == current_user.id,
        TaskSession.end_time.is_(None)
    ).first()
    
    if not session:
        return None
    
    task = db.query(Task).filter(Task.id == session.task_id).first()
    sessions = db.query(TaskSession).filter(TaskSession.task_id == task.id).all()
    total_duration = sum(s.duration_seconds for s in sessions)
    
    task_dict = TaskResponse.model_validate(task).model_dump()
    task_dict["total_duration"] = total_duration
    task_dict["is_running"] = True
    return TaskResponse(**task_dict)

@app.post("/tasks/{task_id}/complete")
def complete_task(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task.status = TaskStatus.COMPLETED
    task.completed_at = datetime.utcnow()
    db.commit()
    return {"message": "Task completed"}

@app.get("/")
def root():
    return {"message": "Legal Task Timer API", "version": "1.0.0"}


@app.get("/")
def root():
    return {"message": "Legal Task Timer API", "version": "1.0.0"}

# Updated CORS - 2025-02-02

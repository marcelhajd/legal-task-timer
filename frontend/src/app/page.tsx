'use client'

import { useState, useEffect } from 'react'
import { Clock, Play, Square, Plus, CheckCircle, BarChart3, Settings } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Task {
  id: number
  title: string
  description?: string
  matter?: string
  status: 'open' | 'completed'
  total_duration: number
  is_running: boolean
  created_at: string
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    if (savedToken) {
      setToken(savedToken)
      fetchTasks(savedToken)
      fetchActiveTask(savedToken)
    }
  }, [])

  useEffect(() => {
    if (activeTask?.is_running) {
      const interval = setInterval(() => {
        setElapsed(prev => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [activeTask?.is_running])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    const endpoint = isLogin ? '/auth/login' : '/auth/register'
    const body = isLogin 
      ? { email, password }
      : { email, password, full_name: fullName }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await response.json()
      
      if (data.access_token) {
        localStorage.setItem('token', data.access_token)
        setToken(data.access_token)
        fetchTasks(data.access_token)
      }
    } catch (error) {
      console.error('Auth error:', error)
    }
  }

  const fetchTasks = async (authToken: string) => {
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const data = await response.json()
      setTasks(data)
    } catch (error) {
      console.error('Fetch tasks error:', error)
    }
  }

  const fetchActiveTask = async (authToken: string) => {
    try {
      const response = await fetch(`${API_URL}/tasks/active`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const data = await response.json()
      if (data) {
        setActiveTask(data)
        setElapsed(data.total_duration)
      }
    } catch (error) {
      console.error('Fetch active task error:', error)
    }
  }

  const createTask = async () => {
    if (!newTaskTitle.trim() || !token) return

    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTaskTitle })
      })
      const newTask = await response.json()
      setTasks([newTask, ...tasks])
      setNewTaskTitle('')
      setShowNewTask(false)
    } catch (error) {
      console.error('Create task error:', error)
    }
  }

  const startTimer = async (taskId: number) => {
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/tasks/${taskId}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      if (data.stopped_task) {
        alert(`Stopped: ${data.stopped_task.title}`)
      }
      
      fetchTasks(token)
      fetchActiveTask(token)
    } catch (error) {
      console.error('Start timer error:', error)
    }
  }

  const stopTimer = async (taskId: number) => {
    if (!token) return

    try {
      await fetch(`${API_URL}/tasks/${taskId}/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      setActiveTask(null)
      fetchTasks(token)
    } catch (error) {
      console.error('Stop timer error:', error)
    }
  }

  const completeTask = async (taskId: number) => {
    if (!token) return

    try {
      await fetch(`${API_URL}/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchTasks(token)
      if (activeTask?.id === taskId) {
        setActiveTask(null)
      }
    } catch (error) {
      console.error('Complete task error:', error)
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setTasks([])
    setActiveTask(null)
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full mb-4">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Legal Task Timer</h1>
            <p className="text-gray-600 mt-2">Track your legal work with precision</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="you@lawfirm.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="John Doe"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg"
            >
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Legal Task Timer</h1>
                <p className="text-xs text-gray-500">Professional time tracking</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <BarChart3 className="w-5 h-5 text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Active Timer Widget */}
      {activeTask && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl shadow-2xl p-6 min-w-[340px] animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium opacity-90">Now Tracking</span>
              </div>
              <button
                onClick={() => stopTimer(activeTask.id)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Square className="w-5 h-5" />
              </button>
            </div>
            
            <h3 className="text-lg font-semibold mb-4 line-clamp-2">{activeTask.title}</h3>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 opacity-90" />
                <span className="text-3xl font-mono font-bold tabular-nums">
                  {formatTime(elapsed)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Tasks</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {tasks.filter(t => t.status === 'open').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {tasks.filter(t => t.status === 'completed').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Time</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {Math.floor(tasks.reduce((sum, t) => sum + t.total_duration, 0) / 3600)}h
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tasks Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Tasks</h2>
              <button
                onClick={() => setShowNewTask(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>New Task</span>
              </button>
            </div>
          </div>

          {showNewTask && (
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createTask()}
                placeholder="Task title..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
                autoFocus
              />
              <div className="flex space-x-2">
                <button
                  onClick={createTask}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewTask(false)
                    setNewTaskTitle('')
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-gray-200">
            {tasks.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No tasks yet. Create your first task to start tracking!</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
                        {task.status === 'completed' && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            Completed
                          </span>
                        )}
                        {task.is_running && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center space-x-1">
                            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                            <span>Running</span>
                          </span>
                        )}
                      </div>
                      {task.matter && (
                        <p className="text-sm text-gray-500 mt-1">Matter: {task.matter}</p>
                      )}
                      <p className="text-sm text-gray-600 mt-2">
                        Total: {formatTime(task.total_duration)}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {task.status === 'open' && !task.is_running && (
                        <button
                          onClick={() => startTimer(task.id)}
                          className="p-3 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
                        >
                          <Play className="w-5 h-5" />
                        </button>
                      )}
                      
                      {task.is_running && (
                        <button
                          onClick={() => stopTimer(task.id)}
                          className="p-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                        >
                          <Square className="w-5 h-5" />
                        </button>
                      )}

                      {task.status === 'open' && (
                        <button
                          onClick={() => completeTask(task.id)}
                          className="p-3 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

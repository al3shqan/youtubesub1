import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Verify token and get user info
      fetchUserInfo();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUserInfo = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = (accessToken, userData) => {
    setToken(accessToken);
    setUser(userData);
    localStorage.setItem('token', accessToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Login Component
const Login = () => {
  const handleLogin = () => {
    window.location.href = `${API}/auth/login`;
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">YouTube Subscriptions</h1>
            <p className="text-gray-400 mb-8">
              Access your subscription feed in a distraction-free environment
            </p>
          </div>
          
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
          
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm">
              We'll only access your YouTube subscriptions
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const { user, logout } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('videos');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSubscriptions();
    loadVideos();
  }, []);

  const loadSubscriptions = async () => {
    try {
      const response = await axios.get(`${API}/subscriptions`);
      setSubscriptions(response.data.subscriptions);
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    }
  };

  const loadVideos = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/subscription-videos`);
      setVideos(response.data.videos);
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshSubscriptions = async () => {
    try {
      setRefreshing(true);
      await axios.post(`${API}/refresh-subscriptions`);
      await loadSubscriptions();
      await loadVideos();
    } catch (error) {
      console.error('Failed to refresh subscriptions:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return `${Math.ceil(diffDays / 30)} months ago`;
  };

  const openVideo = (videoId) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-white">My Subscriptions</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={refreshSubscriptions}
                disabled={refreshing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-200"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              
              <div className="flex items-center space-x-3">
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-white text-sm">{user.name}</span>
                <button
                  onClick={logout}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('videos')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'videos'
                  ? 'border-red-500 text-red-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Latest Videos ({videos.length})
            </button>
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'subscriptions'
                  ? 'border-red-500 text-red-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Channels ({subscriptions.length})
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'videos' && (
          <div>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                <span className="ml-3 text-gray-400">Loading videos...</span>
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">No videos found from your subscriptions.</p>
                <button
                  onClick={refreshSubscriptions}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                >
                  Refresh Subscriptions
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {videos.map((video) => (
                  <div
                    key={video.video_id}
                    className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition duration-200 cursor-pointer"
                    onClick={() => openVideo(video.video_id)}
                  >
                    <div className="relative">
                      <img
                        src={video.thumbnail_url}
                        alt={video.title}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-20 transition duration-200 flex items-center justify-center">
                        <svg className="w-12 h-12 text-white opacity-0 hover:opacity-100 transition duration-200" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="text-white font-medium line-clamp-2 mb-2">
                        {video.title}
                      </h3>
                      <p className="text-gray-400 text-sm mb-1">{video.channel_title}</p>
                      <p className="text-gray-500 text-xs">{formatDate(video.published_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div>
            {subscriptions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">No subscriptions found.</p>
                <button
                  onClick={refreshSubscriptions}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                >
                  Load Subscriptions
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {subscriptions.map((subscription) => (
                  <div
                    key={subscription.channel_id}
                    className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition duration-200"
                  >
                    <div className="flex items-center space-x-3">
                      <img
                        src={subscription.thumbnail_url}
                        alt={subscription.channel_title}
                        className="w-12 h-12 rounded-full"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">
                          {subscription.channel_title}
                        </h3>
                        {subscription.channel_description && (
                          <p className="text-gray-400 text-sm line-clamp-2 mt-1">
                            {subscription.channel_description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Auth Callback Component
const AuthCallback = () => {
  const { login } = useAuth();

  useEffect(() => {
    // Handle OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      // The backend handles the OAuth flow, redirect to login endpoint
      window.location.href = `${API}/auth/google${window.location.search}`;
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      <span className="ml-3 text-white">Authenticating...</span>
    </div>
  );
};

// Main App Component
function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
        <span className="ml-3 text-white">Loading...</span>
      </div>
    );
  }

  // Check if this is an OAuth callback
  const isAuthCallback = window.location.pathname === '/auth/google' || window.location.search.includes('code=');
  
  if (isAuthCallback) {
    return <AuthCallback />;
  }

  return (
    <div className="App">
      {isAuthenticated ? <Dashboard /> : <Login />}
    </div>
  );
}

// Root App with Context
function AppWithContext() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

export default AppWithContext;
import React, { useState } from 'react';

function Login({ onLogin, onBack, theme, onToggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onLogin({ username, password });
    } catch (err) {
      console.error('Login error:', err);

      // Better error handling
      let errorMessage = 'Login failed. Please try again.';

      if (err.response) {
        // Server responded with error
        errorMessage = err.response.data?.error || errorMessage;
      } else if (err.request) {
        // Request made but no response
        errorMessage = 'Cannot connect to server. Please check your network connection.';
      } else {
        // Something else happened
        errorMessage = err.message || errorMessage;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (user) => {
    setUsername(user);
    // For demo purposes - in production, remove password hints
    const passwords = {
      'anuradha': 'password123',
      'admin': 'admin123',
      'wardstaff': 'ward123',
      'erstaff': 'er123'
    };
    setPassword(passwords[user] || '');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-topbar">
          {onBack && (
            <button
              type="button"
              className="login-back-btn"
              onClick={onBack}
              aria-label="Back to landing page"
            >
              ← Back
            </button>
          )}
          <button
            type="button"
            className="theme-toggle theme-toggle-surface login-theme-toggle"
            onClick={onToggleTheme}
            aria-label="Toggle color theme"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span className="theme-icon">
              {theme === 'light' ? '🌙' : '☀️'}
            </span>
          </button>
        </div>

        <div className="login-header">
          <div className="login-icon">🏥</div>
          <h1>BedManager</h1>
          <p>Hospital Bed & ICU Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              ❌ {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="quick-login">
          <p className="quick-login-title">Quick Login (Demo):</p>
          <div className="quick-login-buttons">
            
            <button
              onClick={() => quickLogin('admin')}
              className="quick-btn admin"
            >
              <span className="role-icon">👨‍💼</span>
              <span className="role-name">Admin</span>
              <span className="role-title">Administrator</span>
            </button>
            <button
              onClick={() => quickLogin('wardstaff')}
              className="quick-btn ward-staff"
            >
              <span className="role-icon">👨‍⚕️</span>
              <span className="role-name">Ward Staff</span>
              <span className="role-title">General Ward</span>
            </button>
             <button
              onClick={() => quickLogin('anuradha')}
              className="quick-btn anuradha"
            >
              <span className="role-icon">👨‍💼</span>
              <span className="role-name">Anuradha</span>
              <span className="role-title">Bed Manager</span>
            </button>
             <button
              onClick={() => quickLogin('erstaff')}
              className="quick-btn erstaff"
            >
              <span className="role-icon">👨‍💼</span>
              <span className="role-name">ER staff</span>
              <span className="role-title">Admissions Staff</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
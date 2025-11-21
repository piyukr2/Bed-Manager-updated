import React from 'react';
import './Home.css';

function Home({ onGetStarted, theme, onToggleTheme }) {
    return (
        <div className="home-page">
            {/* Navigation */}
            <nav className="home-nav">
                <div className="nav-container">
                    <div className="nav-brand">
                        <div className="brand-icon">🏥</div>
                        <span className="brand-text">BedManager</span>
                    </div>
                    <div className="nav-actions">
                        <button
                            onClick={onToggleTheme}
                            className="theme-toggle theme-toggle-surface nav-theme-toggle"
                            aria-label="Toggle color theme"
                            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                        >
                            <span className="theme-icon">
                                {theme === 'light' ? '🌙' : '☀️'}
                            </span>
                        </button>
                        <button onClick={onGetStarted} className="nav-login-btn">
                            Login
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-container">
                    <div className="hero-content">
                        <h1 className="hero-title">
                            Real-Time Hospital Bed Management
                        </h1>
                        <p className="hero-description">
                            Streamline ICU occupancy, optimize bed allocation, and improve patient care with intelligent real-time monitoring
                        </p>
                        <button onClick={onGetStarted} className="hero-cta-btn">
                            Get Started →
                        </button>
                    </div>

                </div>
            </section>

            {/* Features Section */}
            <section className="features-section">
                <div className="features-container">
                    <div className="section-header">
                        <h2 className="section-title">Powerful Features</h2>
                        <p className="section-subtitle">Everything you need to manage hospital beds efficiently</p>
                    </div>

                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon feature-icon-blue">📊</div>
                            <h3 className="feature-title">Real-Time Monitoring</h3>
                            <p className="feature-description">
                                Track bed occupancy across all wards with live updates and instant notifications
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon feature-icon-cyan">⚡</div>
                            <h3 className="feature-title">Smart Allocation</h3>
                            <p className="feature-description">
                                Automated bed recommendations based on equipment needs and ward preferences
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon feature-icon-purple">🛡️</div>
                            <h3 className="feature-title">Role-Based Access</h3>
                            <p className="feature-description">
                                Secure access control for administrators, ICU managers, and ward staff
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon feature-icon-green">📈</div>
                            <h3 className="feature-title">Analytics & Reports</h3>
                            <p className="feature-description">
                                Comprehensive insights with occupancy trends and capacity forecasting
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon feature-icon-orange">👥</div>
                            <h3 className="feature-title">Patient Management</h3>
                            <p className="feature-description">
                                Track patient admissions, transfers, and discharges seamlessly
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon feature-icon-red">✅</div>
                            <h3 className="feature-title">Emergency Ready</h3>
                            <p className="feature-description">
                                Rapid response system for critical admissions with instant bed availability
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Use Case Section */}
            <section className="usecase-section">
                <div className="usecase-container">
                    <div className="section-header">
                        <h2 className="section-title">Built for Healthcare Professionals</h2>
                        <p className="section-subtitle">Designed to solve real challenges faced by ICU managers daily</p>
                    </div>

                    <div className="usecase-card">
                        <div className="usecase-grid">
                            <div className="usecase-column">
                                <div className="usecase-badge usecase-badge-problem">The Challenge</div>
                                <h3 className="usecase-heading">Managing ICU Capacity in Real-Time</h3>
                                <p className="usecase-text">
                                    ICU Manager Anuradha faces daily challenges coordinating bed availability,
                                    managing emergency admissions, and optimizing ward utilization without real-time visibility.
                                </p>
                                <div className="usecase-list">
                                    <div className="usecase-list-item usecase-list-problem">
                                        <span className="usecase-icon">✕</span>
                                        <span>Delays in critical patient admissions</span>
                                    </div>
                                    <div className="usecase-list-item usecase-list-problem">
                                        <span className="usecase-icon">✕</span>
                                        <span>Inefficient bed utilization across wards</span>
                                    </div>
                                    <div className="usecase-list-item usecase-list-problem">
                                        <span className="usecase-icon">✕</span>
                                        <span>Manual coordination causing stress</span>
                                    </div>
                                    <div className="usecase-list-item usecase-list-problem">
                                        <span className="usecase-icon">✕</span>
                                        <span>Lack of forecasting for capacity planning</span>
                                    </div>
                                </div>
                            </div>

                            <div className="usecase-column">
                                <div className="usecase-badge usecase-badge-solution">The Solution</div>
                                <h3 className="usecase-heading">BedManager Dashboard</h3>
                                <p className="usecase-text">
                                    Real-time visibility into all 40 ICU beds, automatic alerts when occupancy reaches
                                    critical levels, and intelligent bed allocation for emergency cases.
                                </p>
                                <div className="usecase-list">
                                    <div className="usecase-list-item usecase-list-solution">
                                        <span className="usecase-icon">✓</span>
                                        <span>Instant view of bed availability (35/40 occupied)</span>
                                    </div>
                                    <div className="usecase-list-item usecase-list-solution">
                                        <span className="usecase-icon">✓</span>
                                        <span>Automatic alerts at 90% capacity threshold</span>
                                    </div>
                                    <div className="usecase-list-item usecase-list-solution">
                                        <span className="usecase-icon">✓</span>
                                        <span>Smart bed recommendations for emergencies</span>
                                    </div>
                                    <div className="usecase-list-item usecase-list-solution">
                                        <span className="usecase-icon">✓</span>
                                        <span>Forecasting with discharge schedules</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="cta-container">
                    <div className="cta-card">
                        <h2 className="cta-title">Ready to Transform Your Hospital Management?</h2>
                        <p className="cta-description">
                            Join healthcare professionals who are already optimizing their bed management
                        </p>
                        <button onClick={onGetStarted} className="cta-button">
                            Login to Dashboard →
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="home-footer">
                <div className="footer-container">
                    <div className="footer-brand">
                        <div className="footer-icon">🏥</div>
                        <span className="footer-brand-text">BedManager</span>
                    </div>
                    <p className="footer-description">
                        Real-Time Hospital Bed & ICU Occupancy Management
                    </p>
                    <p className="footer-contact">
                        Contact: saianirudh.karre@iiit.ac.in
                    </p>
                </div>
            </footer>
        </div>
    );
}

export default Home;
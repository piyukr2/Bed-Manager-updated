import React, { useState, useRef, useEffect } from 'react';
import './AdminChatbot.css';

const AdminChatbot = () => {
  const [messages, setMessages] = useState([
    {
      type: 'assistant',
      content: '👋 Hello! I\'m your hospital analytics assistant. I can help you analyze bed management data from the past 60 days. Ask me anything about occupancy trends, bed requests, patient statistics, or ward performance!',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Sample questions
  const sampleQuestions = [
    "What's the current occupancy trend?",
    "Which ward has the highest occupancy?",
    "How many bed requests were approved this month?",
    "What's the average patient stay duration?",
    "Show me peak occupancy times"
  ];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (messageText = inputMessage) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage = {
      type: 'user',
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Build conversation history (exclude the welcome message at index 0)
      const conversationHistory = messages.slice(1).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/chatbot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: messageText,
          history: conversationHistory
        })
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage = {
          type: 'assistant',
          content: data.message,
          dataPoints: data.dataPoints,
          metadata: data.metadata,
          timestamp: new Date(data.timestamp)
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorMessage = {
          type: 'error',
          content: data.error || 'Failed to get response. Please try again.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Chatbot error:', error);
      const errorMessage = {
        type: 'error',
        content: 'Failed to connect to analytics service. Please check your connection and try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSampleQuestion = (question) => {
    handleSendMessage(question);
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const clearChat = () => {
    setMessages([{
      type: 'assistant',
      content: '👋 Hello! I\'m your hospital analytics assistant. I can help you analyze bed management data from the past 60 days. Ask me anything about occupancy trends, bed requests, patient statistics, or ward performance!',
      timestamp: new Date()
    }]);
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`admin-chatbot ${isMinimized ? 'minimized' : ''}`}>
      <div className="chatbot-header" onClick={toggleMinimize}>
        <div className="header-left">
          <span className="chatbot-icon">🤖</span>
          <span className="chatbot-title">Analytics Assistant</span>
          <span className="online-indicator">● Online</span>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isMinimized && messages.length > 1 && (
            <button
              className="clear-btn"
              onClick={(e) => { e.stopPropagation(); clearChat(); }}
              title="Clear chat"
            >
              🗑️
            </button>
          )}
          <button
            className="minimize-btn"
            onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}
            title={isMinimized ? "Expand chat" : "Minimize chat"}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="chatbot-messages" ref={chatContainerRef}>
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.type}`}>
                <div className="message-content">
                  <div className="message-text">{message.content}</div>
                  {message.dataPoints && (
                    <div className="data-points">
                      <div className="data-point">
                        <span className="label">Occupancy Records:</span>
                        <span className="value">{message.dataPoints.occupancyRecords}</span>
                      </div>
                      <div className="data-point">
                        <span className="label">Avg Occupancy:</span>
                        <span className="value">{message.dataPoints.avgOccupancy}%</span>
                      </div>
                      <div className="data-point">
                        <span className="label">Current Occupancy:</span>
                        <span className="value">{message.dataPoints.currentOccupancy}%</span>
                      </div>
                      <div className="data-point">
                        <span className="label">Total Requests:</span>
                        <span className="value">{message.dataPoints.totalRequests}</span>
                      </div>
                      <div className="data-point">
                        <span className="label">Total Admissions:</span>
                        <span className="value">{message.dataPoints.totalAdmissions}</span>
                      </div>
                      <div className="data-point">
                        <span className="label">Total Beds:</span>
                        <span className="value">{message.dataPoints.totalBeds}</span>
                      </div>
                    </div>
                  )}
                  <div className="message-timestamp">{formatTimestamp(message.timestamp)}</div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message assistant">
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {messages.length === 1 && (
            <div className="sample-questions">
              <div className="sample-label">Try asking:</div>
              <div className="sample-chips">
                {sampleQuestions.map((question, index) => (
                  <button
                    key={index}
                    className="sample-chip"
                    onClick={() => handleSampleQuestion(question)}
                    disabled={isLoading}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chatbot-input">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about occupancy, trends, statistics..."
              disabled={isLoading}
              rows="1"
            />
            <button
              className="send-btn"
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
            >
              {isLoading ? '⏳' : '📤'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminChatbot;

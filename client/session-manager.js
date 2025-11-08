// Session management (save/load functionality)
class SessionManager {
    constructor(roomId) {
        this.roomId = roomId || 'default';
    }
    
    async saveSession(sessionName) {
        if (!sessionName || sessionName.trim() === '') {
            alert('Please enter a session name');
            return;
        }
        
        try {
            const response = await fetch('/api/save-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    roomId: this.roomId,
                    sessionName: sessionName.trim()
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('Session saved successfully!');
                return true;
            } else {
                alert(`Error saving session: ${data.error}`);
                return false;
            }
        } catch (error) {
            console.error('Error saving session:', error);
            alert('Failed to save session. Please try again.');
            return false;
        }
    }
    
    async loadSession(filename) {
        try {
            const response = await fetch('/api/load-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    roomId: this.roomId,
                    filename: filename
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('Session loaded successfully!');
                return true;
            } else {
                alert(`Error loading session: ${data.error}`);
                return false;
            }
        } catch (error) {
            console.error('Error loading session:', error);
            alert('Failed to load session. Please try again.');
            return false;
        }
    }
    
    async listSessions() {
        try {
            const response = await fetch('/api/sessions');
            const data = await response.json();
            
            if (response.ok) {
                return data.sessions || [];
            } else {
                console.error('Error listing sessions:', data.error);
                return [];
            }
        } catch (error) {
            console.error('Error listing sessions:', error);
            return [];
        }
    }
    
    displaySessions(sessions) {
        const container = document.getElementById('sessions-container');
        const sessionList = document.getElementById('session-list');
        
        if (!container || !sessionList) return;
        
        container.innerHTML = '';
        
        if (sessions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No saved sessions</p>';
            return;
        }
        
        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'session-item';
            
            const date = new Date(session.timestamp);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            item.innerHTML = `
                <div class="session-item-name">${session.sessionName}</div>
                <div class="session-item-date">${dateStr}</div>
            `;
            
            item.addEventListener('click', () => {
                this.loadSession(session.filename);
                sessionList.style.display = 'none';
            });
            
            container.appendChild(item);
        });
    }
}


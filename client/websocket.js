/**
 * WebSocket communication manager
 * Handles all real-time communication between client and server
 * Implements reconnection logic with exponential backoff
 */
class WebSocketManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.userId = null;
        this.currentRoom = 'default';
        this.users = new Map();
        
        // Reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.reconnectTimer = null;
        
        // Offline queue for drawing events during disconnection
        this.offlineQueue = [];
        this.maxQueueSize = 100;
    }

    /**
     * Initialize WebSocket connection with error handling and reconnection logic
     */
    connect() {
        try {
            this.socket = io({
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: this.maxReconnectAttempts,
                timeout: 20000
            });
            
            this.setupEventHandlers();
        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
            this.handleConnectionError(error);
        }
    }

    /**
     * Setup all WebSocket event handlers
     */
    setupEventHandlers() {
        this.socket.on('connect', () => {
            this.handleConnect();
        });

        this.socket.on('disconnect', (reason) => {
            this.handleDisconnect(reason);
        });

        this.socket.on('connect_error', (error) => {
            this.handleConnectionError(error);
        });

        this.socket.on('reconnect', (attemptNumber) => {
            this.handleReconnect(attemptNumber);
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
        });

        this.socket.on('reconnect_failed', () => {
            this.handleReconnectFailed();
        });

        // Canvas state synchronization
        this.socket.on('canvas-state', (data) => {
            try {
                if (window.canvasManager && data && data.history && data.currentState) {
                    window.canvasManager.loadState(data.history, data.currentState);
                } else {
                    console.warn('Invalid canvas state data received');
                }
            } catch (error) {
                console.error('Error loading canvas state:', error);
            }
        });

        // Drawing events from other users with validation
        this.socket.on('draw-start', (data) => {
            try {
                if (this.validateDrawingData(data) && window.canvasManager && data.userId !== this.userId) {
                    window.canvasManager.remoteDrawStart(data);
                }
            } catch (error) {
                console.error('Error handling draw-start:', error);
            }
        });

        this.socket.on('draw-move', (data) => {
            try {
                if (this.validateDrawingData(data) && window.canvasManager && data.userId !== this.userId) {
                    window.canvasManager.remoteDrawMove(data);
                }
            } catch (error) {
                console.error('Error handling draw-move:', error);
            }
        });

        this.socket.on('draw-end', (data) => {
            try {
                if (data && data.strokeId && window.canvasManager && data.userId !== this.userId) {
                    window.canvasManager.remoteDrawEnd(data);
                }
            } catch (error) {
                console.error('Error handling draw-end:', error);
            }
        });

        // Cursor position updates
        this.socket.on('cursor-move', (data) => {
            if (data.userId !== this.userId && window.canvasManager) {
                const user = this.users.get(data.userId);
                if (user) {
                    window.canvasManager.updateRemoteCursor(
                        data.userId,
                        data.x,
                        data.y,
                        user.color
                    );
                }
            }
        });

        // Undo/Redo events
        this.socket.on('undo', (data) => {
            if (window.canvasManager) {
                window.canvasManager.undoStroke(data.strokeId);
            }
        });

        this.socket.on('redo', (data) => {
            if (window.canvasManager && data.stroke) {
                window.canvasManager.redoStroke(data.stroke);
            }
        });

        // User management
        this.socket.on('users-updated', (users) => {
            this.updateUsersList(users);
        });

        // Clear canvas event
        this.socket.on('clear', (data) => {
            try {
                if (window.canvasManager) {
                    window.canvasManager.clear();
                }
            } catch (error) {
                console.error('Error handling clear:', error);
            }
        });
    }

    /**
     * Handle successful connection
     */
    handleConnect() {
        this.connected = true;
        this.userId = this.socket.id;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.updateConnectionStatus(true);
        console.log('Connected to server:', this.socket.id);
        
        // Join default room
        this.joinRoom(this.currentRoom);
        
        // Start latency monitoring if performance monitor is available
        if (window.performanceMonitor) {
            window.performanceMonitor.startLatencyMonitoring(this.socket);
        }
        
        // Process offline queue
        this.processOfflineQueue();
    }

    /**
     * Handle disconnection
     */
    handleDisconnect(reason) {
        this.connected = false;
        this.updateConnectionStatus(false);
        console.log('Disconnected from server. Reason:', reason);
        
        // Stop latency monitoring
        if (window.performanceMonitor) {
            window.performanceMonitor.stop();
        }
    }

    /**
     * Handle connection errors
     */
    handleConnectionError(error) {
        console.error('Connection error:', error);
        this.updateConnectionStatus(false);
    }

    /**
     * Handle successful reconnection
     */
    handleReconnect(attemptNumber) {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
    }

    /**
     * Handle reconnection failure
     */
    handleReconnectFailed() {
        console.error('Failed to reconnect after maximum attempts');
        this.updateConnectionStatus(false);
        // Show user-friendly message
        const text = document.getElementById('connection-text');
        if (text) {
            text.textContent = 'Connection lost. Please refresh.';
        }
    }

    /**
     * Validate drawing data to prevent invalid operations
     */
    validateDrawingData(data) {
        if (!data) return false;
        
        // Validate coordinates are numbers and within reasonable bounds
        if (typeof data.x !== 'number' || typeof data.y !== 'number') return false;
        if (isNaN(data.x) || isNaN(data.y)) return false;
        if (data.x < 0 || data.y < 0 || data.x > 10000 || data.y > 10000) return false;
        
        // Validate strokeId exists
        if (!data.strokeId || typeof data.strokeId !== 'string') return false;
        
        return true;
    }

    /**
     * Queue drawing event when offline
     */
    queueEvent(eventType, data) {
        if (this.offlineQueue.length >= this.maxQueueSize) {
            // Remove oldest events if queue is full
            this.offlineQueue.shift();
        }
        this.offlineQueue.push({ type: eventType, data, timestamp: Date.now() });
    }

    /**
     * Process queued events when connection is restored
     */
    processOfflineQueue() {
        if (this.offlineQueue.length === 0) return;
        
        console.log(`Processing ${this.offlineQueue.length} queued events`);
        
        // Process events in order
        this.offlineQueue.forEach(event => {
            try {
                switch (event.type) {
                    case 'draw-start':
                        this.startDrawing(event.data.coords, event.data.strokeId);
                        break;
                    case 'draw-move':
                        this.drawMove(event.data.coords, event.data.strokeId);
                        break;
                    case 'draw-end':
                        this.endDrawing(event.data.strokeId);
                        break;
                }
            } catch (error) {
                console.error('Error processing queued event:', error);
            }
        });
        
        // Clear queue after processing
        this.offlineQueue = [];
    }

    joinRoom(roomId) {
        this.currentRoom = roomId;
        if (this.socket) {
            this.socket.emit('join-room', roomId);
        }
    }

    /**
     * Send draw-start event to server
     * Queues event if offline
     */
    startDrawing(coords, strokeId) {
        if (!this.socket) return;
        
        const tool = window.canvasManager ? window.canvasManager.tool : 'brush';
        const color = window.canvasManager ? window.canvasManager.color : '#000000';
        const lineWidth = window.canvasManager ? window.canvasManager.lineWidth : 5;
        
        const data = {
            x: coords.x,
            y: coords.y,
            color: color,
            lineWidth: lineWidth,
            tool: tool,
            strokeId: strokeId
        };
        
        if (this.connected) {
            try {
                this.socket.emit('draw-start', data);
            } catch (error) {
                console.error('Error sending draw-start:', error);
                this.queueEvent('draw-start', { coords, strokeId });
            }
        } else {
            this.queueEvent('draw-start', { coords, strokeId });
        }
    }

    /**
     * Send draw-move event to server with throttling
     * Queues event if offline
     */
    drawMove(coords, strokeId) {
        if (!this.socket) return;
        
        const data = {
            x: coords.x,
            y: coords.y,
            strokeId: strokeId
        };
        
        if (this.connected) {
            try {
                this.socket.emit('draw-move', data);
                
                // Throttle cursor position updates (only send every 100ms)
                if (!this.lastCursorUpdate || Date.now() - this.lastCursorUpdate > 100) {
                    this.socket.emit('cursor-move', {
                        x: coords.x,
                        y: coords.y
                    });
                    this.lastCursorUpdate = Date.now();
                }
            } catch (error) {
                console.error('Error sending draw-move:', error);
                this.queueEvent('draw-move', { coords, strokeId });
            }
        } else {
            this.queueEvent('draw-move', { coords, strokeId });
        }
    }

    /**
     * Send draw-end event to server
     * Queues event if offline
     */
    endDrawing(strokeId) {
        if (!this.socket) return;
        
        const data = { strokeId: strokeId };
        
        if (this.connected) {
            try {
                this.socket.emit('draw-end', data);
            } catch (error) {
                console.error('Error sending draw-end:', error);
                this.queueEvent('draw-end', { strokeId });
            }
        } else {
            this.queueEvent('draw-end', { strokeId });
        }
    }

    /**
     * Send undo request to server
     */
    undo() {
        if (!this.connected || !this.socket) {
            console.warn('Cannot undo: not connected');
            return;
        }
        try {
            this.socket.emit('undo');
        } catch (error) {
            console.error('Error sending undo:', error);
        }
    }

    /**
     * Send redo request to server
     */
    redo() {
        if (!this.connected || !this.socket) {
            console.warn('Cannot redo: not connected');
            return;
        }
        try {
            this.socket.emit('redo');
        } catch (error) {
            console.error('Error sending redo:', error);
        }
    }

    /**
     * Send clear canvas request to server
     */
    clear() {
        if (!this.connected || !this.socket) {
            console.warn('Cannot clear: not connected');
            return;
        }
        try {
            this.socket.emit('clear');
        } catch (error) {
            console.error('Error sending clear:', error);
        }
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        
        if (indicator && text) {
            indicator.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
            text.textContent = connected ? 'Connected' : 'Disconnected';
        }
    }

    updateUsersList(users) {
        this.users.clear();
        users.forEach(user => {
            this.users.set(user.id, user);
        });

        const usersList = document.getElementById('users-list');
        if (usersList) {
            usersList.innerHTML = '';
            users.forEach(user => {
                const badge = document.createElement('div');
                badge.className = 'user-badge';
                badge.innerHTML = `
                    <span class="user-color" style="background: ${user.color}"></span>
                    <span>${user.name}</span>
                `;
                usersList.appendChild(badge);
            });
        }
    }
}


// Performance metrics tracking (FPS and latency)
class PerformanceMonitor {
    constructor() {
        this.fps = 0;
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fpsUpdateInterval = 1000; // Update FPS every second
        this.lastFpsUpdate = performance.now();
        
        this.latency = 0;
        this.pingInterval = null;
        this.pingIntervalMs = 1000; // Ping every second
        
        this.fpsElement = document.getElementById('fps-counter');
        this.latencyElement = document.getElementById('latency-display');
        
        this.startFPSMonitoring();
    }
    
    startFPSMonitoring() {
        const updateFPS = (currentTime) => {
            this.frameCount++;
            
            const elapsed = currentTime - this.lastFpsUpdate;
            
            if (elapsed >= this.fpsUpdateInterval) {
                this.fps = Math.round((this.frameCount * 1000) / elapsed);
                this.frameCount = 0;
                this.lastFpsUpdate = currentTime;
                
                if (this.fpsElement) {
                    this.fpsElement.textContent = this.fps;
                    // Color code based on FPS
                    if (this.fps >= 55) {
                        this.fpsElement.style.color = '#4caf50';
                    } else if (this.fps >= 30) {
                        this.fpsElement.style.color = '#ff9800';
                    } else {
                        this.fpsElement.style.color = '#f44336';
                    }
                }
            }
            
            this.lastTime = currentTime;
            requestAnimationFrame(updateFPS);
        };
        
        requestAnimationFrame(updateFPS);
    }
    
    startLatencyMonitoring(socket) {
        if (!socket) return;
        
        // Listen for pong responses
        socket.on('pong', (timestamp) => {
            const latency = Date.now() - timestamp;
            this.latency = latency;
            
            if (this.latencyElement) {
                this.latencyElement.textContent = `${latency} ms`;
                // Color code based on latency
                if (latency < 50) {
                    this.latencyElement.style.color = '#4caf50';
                } else if (latency < 150) {
                    this.latencyElement.style.color = '#ff9800';
                } else {
                    this.latencyElement.style.color = '#f44336';
                }
            }
        });
        
        // Send ping periodically
        this.pingInterval = setInterval(() => {
            if (socket && socket.connected) {
                socket.emit('ping', Date.now());
            }
        }, this.pingIntervalMs);
    }
    
    stop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
}


// Canvas drawing operations and state management
class CanvasManager {
    constructor(canvasId, cursorLayerId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.cursorLayer = document.getElementById(cursorLayerId);
        this.cursorCtx = this.cursorLayer.getContext('2d');
        
        this.isDrawing = false;
        this.currentStroke = null;
        this.strokes = new Map(); // strokeId -> stroke data
        this.remoteCursors = new Map(); // userId -> cursor data
        
        this.tool = 'brush';
        this.color = '#000000';
        this.lineWidth = 5;
        
        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        // Set canvas size to match container
        const resize = () => {
            const container = this.canvas.parentElement;
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            this.canvas.width = width;
            this.canvas.height = height;
            this.cursorLayer.width = width;
            this.cursorLayer.height = height;
            
            // Redraw all strokes after resize
            this.redraw();
        };
        
        resize();
        window.addEventListener('resize', resize);
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseleave', () => this.stopDrawing());
        
        // Touch events for mobile support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    startDrawing(e) {
        this.isDrawing = true;
        const coords = this.getCanvasCoordinates(e);
        
        // Create new stroke
        const strokeId = `local-${Date.now()}-${Math.random()}`;
        this.currentStroke = {
            id: strokeId,
            points: [coords],
            color: this.tool === 'eraser' ? '#FFFFFF' : this.color,
            lineWidth: this.lineWidth,
            tool: this.tool
        };
        
        this.strokes.set(strokeId, this.currentStroke);
        
        // Notify WebSocket manager
        if (window.wsManager) {
            window.wsManager.startDrawing(coords, strokeId);
        }
        
        this.drawPoint(coords, this.currentStroke);
    }

    draw(e) {
        if (!this.isDrawing || !this.currentStroke) return;
        
        const coords = this.getCanvasCoordinates(e);
        this.currentStroke.points.push(coords);
        
        // Draw line segment
        const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 2];
        this.drawLine(lastPoint, coords, this.currentStroke);
        
        // Notify WebSocket manager
        if (window.wsManager) {
            window.wsManager.drawMove(coords, this.currentStroke.id);
        }
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        if (this.currentStroke && window.wsManager) {
            window.wsManager.endDrawing(this.currentStroke.id);
        }
        
        this.currentStroke = null;
    }

    drawPoint(point, stroke) {
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, stroke.lineWidth / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = stroke.color;
        this.ctx.fill();
    }

    drawLine(from, to, stroke) {
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.strokeStyle = stroke.color;
        this.ctx.lineWidth = stroke.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        if (stroke.tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
        }
        
        this.ctx.stroke();
        this.ctx.globalCompositeOperation = 'source-over';
    }

    // Remote drawing methods
    remoteDrawStart(data) {
        const stroke = {
            id: data.strokeId,
            points: [{ x: data.x, y: data.y }],
            color: data.tool === 'eraser' ? '#FFFFFF' : data.color,
            lineWidth: data.lineWidth,
            tool: data.tool,
            userId: data.userId
        };
        
        this.strokes.set(data.strokeId, stroke);
        this.drawPoint({ x: data.x, y: data.y }, stroke);
    }

    remoteDrawMove(data) {
        const stroke = this.strokes.get(data.strokeId);
        if (!stroke) return;
        
        const newPoint = { x: data.x, y: data.y };
        stroke.points.push(newPoint);
        
        if (stroke.points.length >= 2) {
            const lastPoint = stroke.points[stroke.points.length - 2];
            this.drawLine(lastPoint, newPoint, stroke);
        }
    }

    remoteDrawEnd(data) {
        // Stroke is already complete, no action needed
    }

    // Update remote cursor position
    updateRemoteCursor(userId, x, y, color) {
        this.remoteCursors.set(userId, { x, y, color });
        this.drawCursors();
    }

    drawCursors() {
        // Clear cursor layer
        this.cursorCtx.clearRect(0, 0, this.cursorLayer.width, this.cursorLayer.height);
        
        // Draw all remote cursors
        this.remoteCursors.forEach((cursor, userId) => {
            this.cursorCtx.beginPath();
            this.cursorCtx.arc(cursor.x, cursor.y, 10, 0, Math.PI * 2);
            this.cursorCtx.strokeStyle = cursor.color;
            this.cursorCtx.lineWidth = 2;
            this.cursorCtx.stroke();
            
            this.cursorCtx.beginPath();
            this.cursorCtx.arc(cursor.x, cursor.y, 3, 0, Math.PI * 2);
            this.cursorCtx.fillStyle = cursor.color;
            this.cursorCtx.fill();
        });
    }

    // Undo/Redo operations
    undoStroke(strokeId) {
        const stroke = this.strokes.get(strokeId);
        if (stroke) {
            this.strokes.delete(strokeId);
            this.redraw();
        }
    }

    redoStroke(strokeData) {
        // Convert server stroke format to client format
        const stroke = {
            id: strokeData.id,
            points: strokeData.points || [],
            color: strokeData.color,
            lineWidth: strokeData.lineWidth,
            tool: strokeData.tool,
            userId: strokeData.userId
        };
        this.strokes.set(stroke.id, stroke);
        this.redrawStroke(stroke);
    }

    // Redraw entire canvas
    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Redraw all strokes in order
        this.strokes.forEach(stroke => {
            this.redrawStroke(stroke);
        });
    }

    redrawStroke(stroke) {
        if (stroke.points.length === 0) return;
        
        // Draw first point
        this.drawPoint(stroke.points[0], stroke);
        
        // Draw lines between points
        for (let i = 1; i < stroke.points.length; i++) {
            this.drawLine(stroke.points[i - 1], stroke.points[i], stroke);
        }
    }

    // Load canvas state from server
    loadState(history, currentState) {
        this.strokes.clear();
        
        // Add all strokes from history
        history.forEach(strokeData => {
            const stroke = {
                id: strokeData.id,
                points: strokeData.points,
                color: strokeData.color,
                lineWidth: strokeData.lineWidth,
                tool: strokeData.tool,
                userId: strokeData.userId
            };
            this.strokes.set(stroke.id, stroke);
        });
        
        this.redraw();
    }

    // Clear canvas
    clear() {
        this.strokes.clear();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Set tool
    setTool(tool) {
        this.tool = tool;
    }

    // Set color
    setColor(color) {
        this.color = color;
    }

    // Set line width
    setLineWidth(width) {
        this.lineWidth = width;
    }
}


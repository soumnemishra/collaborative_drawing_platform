// Main application initialization and coordination
(function() {
    // Initialize performance monitor first (needed for WebSocket latency tracking)
    window.performanceMonitor = new PerformanceMonitor();
    
    // Initialize session manager
    window.sessionManager = new SessionManager('default');
    
    // Initialize canvas manager
    window.canvasManager = new CanvasManager('drawing-canvas', 'cursor-layer');
    
    // Initialize WebSocket manager
    window.wsManager = new WebSocketManager();
    window.wsManager.connect();
    
    // Tool selection
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tool = btn.getAttribute('data-tool');
            window.canvasManager.setTool(tool);
        });
    });
    
    // Color picker
    const colorInput = document.getElementById('color-input');
    colorInput.addEventListener('change', (e) => {
        window.canvasManager.setColor(e.target.value);
    });
    
    // Color presets
    const colorPresets = document.querySelectorAll('.color-preset');
    colorPresets.forEach(preset => {
        preset.addEventListener('click', () => {
            const color = preset.getAttribute('data-color');
            window.canvasManager.setColor(color);
            colorInput.value = color;
        });
    });
    
    // Brush size
    const brushSize = document.getElementById('brush-size');
    const brushSizeValue = document.getElementById('brush-size-value');
    brushSize.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        window.canvasManager.setLineWidth(size);
        brushSizeValue.textContent = size + 'px';
    });
    
    // Undo/Redo buttons
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    undoBtn.addEventListener('click', () => {
        window.wsManager.undo();
    });
    
    redoBtn.addEventListener('click', () => {
        window.wsManager.redo();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z or Cmd+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            window.wsManager.undo();
        }
        // Ctrl+Shift+Z or Cmd+Shift+Z for redo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
            e.preventDefault();
            window.wsManager.redo();
        }
    });
    
    // Clear button
    const clearBtn = document.getElementById('clear-btn');
    clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the entire canvas?')) {
            if (window.wsManager) {
                window.wsManager.clear();
            } else {
                window.canvasManager.clear();
            }
        }
    });
    
    // Track cursor movement for remote cursor display
    const canvas = document.getElementById('drawing-canvas');
    canvas.addEventListener('mousemove', (e) => {
        if (window.wsManager && window.wsManager.connected) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            window.wsManager.socket.emit('cursor-move', { x, y });
        }
    });
    
    // Save session button
    const saveBtn = document.getElementById('save-btn');
    saveBtn.addEventListener('click', async () => {
        const sessionName = prompt('Enter a name for this session:');
        if (sessionName) {
            await window.sessionManager.saveSession(sessionName);
        }
    });
    
    // Load session button
    const loadBtn = document.getElementById('load-btn');
    const sessionList = document.getElementById('session-list');
    const closeSessionList = document.getElementById('close-session-list');
    
    loadBtn.addEventListener('click', async () => {
        const sessions = await window.sessionManager.listSessions();
        window.sessionManager.displaySessions(sessions);
        sessionList.style.display = 'block';
    });
    
    closeSessionList.addEventListener('click', () => {
        sessionList.style.display = 'none';
    });
    
    console.log('Collaborative Canvas initialized');
})();


import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { RoomManager } from './rooms';
import { DrawingState } from './drawing-state';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager();
const drawingStates = new Map<string, DrawingState>();

// Get project root (where package.json is) and serve client from there
const projectRoot = process.cwd();
const clientPath = path.join(projectRoot, 'client');

// Ensure sessions directory exists
const sessionsDir = path.join(projectRoot, 'sessions');
fs.mkdir(sessionsDir, { recursive: true }).catch(console.error);

// Serve static files from client directory
console.log('Project root:', projectRoot);
console.log('Serving client files from:', clientPath);
app.use(express.static(clientPath));

// Serve index.html at root
app.get('/', (req, res) => {
  const indexPath = path.join(clientPath, 'index.html');
  console.log('Serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

// API endpoint to save session
app.post('/api/save-session', express.json(), async (req, res) => {
  try {
    const { roomId, sessionName } = req.body;
    if (!roomId || !sessionName) {
      return res.status(400).json({ error: 'Room ID and session name are required' });
    }

    const drawingState = drawingStates.get(roomId);
    if (!drawingState) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const sessionData = {
      roomId,
      sessionName,
      timestamp: Date.now(),
      state: drawingState.serialize()
    };

    const filename = `${sessionName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    const filepath = path.join(sessionsDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(sessionData, null, 2));
    
    res.json({ success: true, filename, message: 'Session saved successfully' });
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

// API endpoint to list saved sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const files = await fs.readdir(sessionsDir);
    const sessions = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async (filename) => {
          try {
            const filepath = path.join(sessionsDir, filename);
            const content = await fs.readFile(filepath, 'utf-8');
            const data = JSON.parse(content);
            return {
              filename,
              sessionName: data.sessionName,
              timestamp: data.timestamp,
              roomId: data.roomId
            };
          } catch (error) {
            console.error(`Error reading session file ${filename}:`, error);
            return null;
          }
        })
    );
    
    res.json({ sessions: sessions.filter(Boolean) });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// API endpoint to load session
app.post('/api/load-session', express.json(), async (req, res) => {
  try {
    const { filename, roomId } = req.body;
    if (!filename || !roomId) {
      return res.status(400).json({ error: 'Filename and room ID are required' });
    }

    const filepath = path.join(sessionsDir, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    const sessionData = JSON.parse(content);

    // Initialize or get drawing state for the room
    if (!drawingStates.has(roomId)) {
      drawingStates.set(roomId, new DrawingState());
    }

    const drawingState = drawingStates.get(roomId)!;
    drawingState.deserialize(sessionData.state);

    // Broadcast the loaded state to all users in the room
    io.to(roomId).emit('canvas-state', {
      history: drawingState.getHistory(),
      currentState: drawingState.getCurrentState()
    });

    res.json({ success: true, message: 'Session loaded successfully' });
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentRoom: string | null = null;
  let userId: string = socket.id;

  // Join a room (default room for now)
  socket.on('join-room', (roomId: string = 'default') => {
    if (currentRoom) {
      socket.leave(currentRoom);
      roomManager.removeUser(currentRoom, userId);
    }

    currentRoom = roomId;
    socket.join(roomId);
    roomManager.addUser(roomId, userId, socket.id);

    // Initialize drawing state for room if it doesn't exist
    if (!drawingStates.has(roomId)) {
      drawingStates.set(roomId, new DrawingState());
    }

    const drawingState = drawingStates.get(roomId)!;
    const users = roomManager.getUsers(roomId);

    // Send current canvas state to new user
    socket.emit('canvas-state', {
      history: drawingState.getHistory(),
      currentState: drawingState.getCurrentState()
    });

    // Send user list
    io.to(roomId).emit('users-updated', users);

    console.log(`User ${userId} joined room ${roomId}`);
  });

  /**
   * Validate drawing data to prevent invalid operations and attacks
   */
  const validateDrawingData = (data: any): boolean => {
    if (!data) return false;
    
    // Validate coordinates
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return false;
    if (isNaN(data.x) || isNaN(data.y)) return false;
    if (data.x < 0 || data.y < 0 || data.x > 10000 || data.y > 10000) return false;
    
    return true;
  };

  /**
   * Validate stroke properties
   */
  const validateStrokeProperties = (data: any): boolean => {
    if (!data) return false;
    
    // Validate color (hex color or rgb)
    if (typeof data.color !== 'string') return false;
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(data.color) && 
        !data.color.startsWith('rgb')) return false;
    
    // Validate line width
    if (typeof data.lineWidth !== 'number') return false;
    if (data.lineWidth < 1 || data.lineWidth > 100) return false;
    
    // Validate tool
    if (typeof data.tool !== 'string') return false;
    if (data.tool !== 'brush' && data.tool !== 'eraser') return false;
    
    return true;
  };

  // Handle drawing events with validation and error handling
  socket.on('draw-start', (data: { x: number; y: number; color: string; lineWidth: number; tool: string; strokeId?: string }) => {
    try {
      if (!currentRoom) {
        console.warn(`User ${userId} attempted draw-start without room`);
        return;
      }

      // Validate input data
      if (!validateDrawingData(data) || !validateStrokeProperties(data)) {
        console.warn(`Invalid draw-start data from user ${userId}`);
        socket.emit('error', { message: 'Invalid drawing data' });
        return;
      }

      const drawingState = drawingStates.get(currentRoom);
      if (!drawingState) {
        console.error(`Drawing state not found for room ${currentRoom}`);
        return;
      }

      // Use provided strokeId or generate one
      const strokeId = data.strokeId || uuidv4();
      
      // Start the stroke with the ID
      drawingState.startStroke(userId, { ...data, strokeId });

      // Broadcast to other users in room (not to sender)
      socket.to(currentRoom).emit('draw-start', {
        x: data.x,
        y: data.y,
        color: data.color,
        lineWidth: data.lineWidth,
        tool: data.tool,
        userId,
        strokeId
      });
    } catch (error) {
      console.error(`Error handling draw-start from user ${userId}:`, error);
      socket.emit('error', { message: 'Failed to process drawing start' });
    }
  });

  socket.on('draw-move', (data: { x: number; y: number; strokeId: string }) => {
    try {
      if (!currentRoom) {
        console.warn(`User ${userId} attempted draw-move without room`);
        return;
      }

      // Validate input data
      if (!validateDrawingData(data) || !data.strokeId || typeof data.strokeId !== 'string') {
        console.warn(`Invalid draw-move data from user ${userId}`);
        return;
      }

      const drawingState = drawingStates.get(currentRoom);
      if (!drawingState) {
        console.error(`Drawing state not found for room ${currentRoom}`);
        return;
      }

      drawingState.addPoint(data.strokeId, data.x, data.y);

      // Broadcast to other users (not to sender)
      socket.to(currentRoom).emit('draw-move', {
        ...data,
        userId
      });
    } catch (error) {
      console.error(`Error handling draw-move from user ${userId}:`, error);
    }
  });

  socket.on('draw-end', (data: { strokeId: string }) => {
    try {
      if (!currentRoom) {
        console.warn(`User ${userId} attempted draw-end without room`);
        return;
      }

      // Validate input data
      if (!data || !data.strokeId || typeof data.strokeId !== 'string') {
        console.warn(`Invalid draw-end data from user ${userId}`);
        return;
      }

      const drawingState = drawingStates.get(currentRoom);
      if (!drawingState) {
        console.error(`Drawing state not found for room ${currentRoom}`);
        return;
      }

      drawingState.endStroke(data.strokeId);

      // Broadcast to other users (not to sender)
      socket.to(currentRoom).emit('draw-end', {
        ...data,
        userId
      });
    } catch (error) {
      console.error(`Error handling draw-end from user ${userId}:`, error);
    }
  });

  // Handle cursor position updates
  socket.on('cursor-move', (data: { x: number; y: number }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('cursor-move', {
      ...data,
      userId
    });
  });

  // Handle ping for latency measurement
  socket.on('ping', (timestamp: number) => {
    socket.emit('pong', timestamp);
  });

  // Handle undo/redo with error handling
  socket.on('undo', () => {
    try {
      if (!currentRoom) {
        console.warn(`User ${userId} attempted undo without room`);
        return;
      }

      const drawingState = drawingStates.get(currentRoom);
      if (!drawingState) {
        console.error(`Drawing state not found for room ${currentRoom}`);
        return;
      }

      const undoneStroke = drawingState.undo();

      if (undoneStroke) {
        // Broadcast undo to all users in room
        io.to(currentRoom).emit('undo', {
          strokeId: undoneStroke.id,
          userId
        });
      } else {
        // No stroke to undo - notify sender only
        socket.emit('undo-failed', { message: 'Nothing to undo' });
      }
    } catch (error) {
      console.error(`Error handling undo from user ${userId}:`, error);
      socket.emit('error', { message: 'Failed to undo' });
    }
  });

  socket.on('redo', () => {
    try {
      if (!currentRoom) {
        console.warn(`User ${userId} attempted redo without room`);
        return;
      }

      const drawingState = drawingStates.get(currentRoom);
      if (!drawingState) {
        console.error(`Drawing state not found for room ${currentRoom}`);
        return;
      }

      const redoneStroke = drawingState.redo();

      if (redoneStroke) {
        // Broadcast redo to all users in room with full stroke data
        io.to(currentRoom).emit('redo', {
          stroke: redoneStroke,
          userId
        });
      } else {
        // No stroke to redo - notify sender only
        socket.emit('redo-failed', { message: 'Nothing to redo' });
      }
    } catch (error) {
      console.error(`Error handling redo from user ${userId}:`, error);
      socket.emit('error', { message: 'Failed to redo' });
    }
  });

  // Handle clear canvas with error handling
  socket.on('clear', () => {
    try {
      if (!currentRoom) {
        console.warn(`User ${userId} attempted clear without room`);
        return;
      }

      const drawingState = drawingStates.get(currentRoom);
      if (!drawingState) {
        console.error(`Drawing state not found for room ${currentRoom}`);
        return;
      }

      drawingState.clear();

      // Broadcast clear to all users in room
      io.to(currentRoom).emit('clear', { userId });
    } catch (error) {
      console.error(`Error handling clear from user ${userId}:`, error);
      socket.emit('error', { message: 'Failed to clear canvas' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (currentRoom) {
      roomManager.removeUser(currentRoom, userId);
      io.to(currentRoom).emit('users-updated', roomManager.getUsers(currentRoom));
      console.log(`User ${userId} disconnected from room ${currentRoom}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


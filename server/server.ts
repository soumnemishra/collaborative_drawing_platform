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

  // Handle drawing events
  socket.on('draw-start', (data: { x: number; y: number; color: string; lineWidth: number; tool: string; strokeId?: string }) => {
    if (!currentRoom) return;

    const drawingState = drawingStates.get(currentRoom)!;
    // Use provided strokeId or generate one
    const strokeId = data.strokeId || uuidv4();
    
    // Start the stroke with the ID
    drawingState.startStroke(userId, { ...data, strokeId });

    // Broadcast to other users in room
    socket.to(currentRoom).emit('draw-start', {
      x: data.x,
      y: data.y,
      color: data.color,
      lineWidth: data.lineWidth,
      tool: data.tool,
      userId,
      strokeId
    });
  });

  socket.on('draw-move', (data: { x: number; y: number; strokeId: string }) => {
    if (!currentRoom) return;

    const drawingState = drawingStates.get(currentRoom)!;
    drawingState.addPoint(data.strokeId, data.x, data.y);

    // Broadcast to other users
    socket.to(currentRoom).emit('draw-move', {
      ...data,
      userId
    });
  });

  socket.on('draw-end', (data: { strokeId: string }) => {
    if (!currentRoom) return;

    const drawingState = drawingStates.get(currentRoom)!;
    drawingState.endStroke(data.strokeId);

    // Broadcast to other users
    socket.to(currentRoom).emit('draw-end', {
      ...data,
      userId
    });
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

  // Handle undo/redo
  socket.on('undo', () => {
    if (!currentRoom) return;

    const drawingState = drawingStates.get(currentRoom)!;
    const undoneStroke = drawingState.undo();

    if (undoneStroke) {
      // Broadcast undo to all users
      io.to(currentRoom).emit('undo', {
        strokeId: undoneStroke.id,
        userId
      });
    }
  });

  socket.on('redo', () => {
    if (!currentRoom) return;

    const drawingState = drawingStates.get(currentRoom)!;
    const redoneStroke = drawingState.redo();

    if (redoneStroke) {
      // Broadcast redo to all users with full stroke data
      io.to(currentRoom).emit('redo', {
        stroke: redoneStroke,
        userId
      });
    }
  });

  // Handle clear canvas
  socket.on('clear', () => {
    if (!currentRoom) return;

    const drawingState = drawingStates.get(currentRoom)!;
    drawingState.clear();

    // Broadcast clear to all users
    io.to(currentRoom).emit('clear', { userId });
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


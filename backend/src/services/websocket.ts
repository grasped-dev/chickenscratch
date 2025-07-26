import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface SocketUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.corsOrigin,
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware for WebSocket connections
    this.io.use((socket: any, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        socket.user = {
          id: decoded.userId,
          email: decoded.email,
          name: decoded.name
        };
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.user?.email} connected via WebSocket`);
      
      // Store user connection
      if (socket.user) {
        this.connectedUsers.set(socket.user.id, socket.id);
      }

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.user?.email} disconnected from WebSocket`);
        if (socket.user) {
          this.connectedUsers.delete(socket.user.id);
        }
      });

      // Handle joining project rooms for project-specific updates
      socket.on('join-project', (projectId: string) => {
        socket.join(`project-${projectId}`);
        console.log(`User ${socket.user?.email} joined project room: ${projectId}`);
      });

      // Handle leaving project rooms
      socket.on('leave-project', (projectId: string) => {
        socket.leave(`project-${projectId}`);
        console.log(`User ${socket.user?.email} left project room: ${projectId}`);
      });
    });
  }

  /**
   * Send upload progress update to a specific user
   */
  sendUploadProgress(userId: string, data: {
    fileId: string;
    filename: string;
    progress: number;
    status: 'uploading' | 'completed' | 'failed';
    error?: string;
  }) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('upload-progress', data);
    }
  }

  /**
   * Send upload progress update to all users in a project room
   */
  sendProjectUploadProgress(projectId: string, data: {
    fileId: string;
    filename: string;
    progress: number;
    status: 'uploading' | 'completed' | 'failed';
    error?: string;
  }) {
    this.io.to(`project-${projectId}`).emit('upload-progress', data);
  }

  /**
   * Send processing status update to a specific user
   */
  sendProcessingStatus(userId: string, data: {
    fileId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message?: string;
    error?: string;
  }) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('processing-status', data);
    }
  }

  /**
   * Send processing status update to all users in a project room
   */
  sendProjectProcessingStatus(projectId: string, data: {
    fileId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message?: string;
    error?: string;
  }) {
    this.io.to(`project-${projectId}`).emit('processing-status', data);
  }

  /**
   * Send general notification to a user
   */
  sendNotification(userId: string, notification: {
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    data?: any;
  }) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
    }
  }

  /**
   * Send job status update to a specific user
   */
  sendJobStatus(userId: string, data: {
    jobId: string;
    jobType: string;
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
    progress?: number;
    message?: string;
    result?: any;
    error?: string;
  }) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('job-status', data);
    }
  }

  /**
   * Send job progress update to a specific user
   */
  sendJobProgress(userId: string, data: {
    jobId: string;
    jobType: string;
    progress: number;
    message: string;
    stage: string;
    data?: any;
  }) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('job-progress', data);
    }
  }

  /**
   * Send job status update to all users in a project room
   */
  sendProjectJobStatus(projectId: string, data: {
    jobId: string;
    jobType: string;
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
    progress?: number;
    message?: string;
    result?: any;
    error?: string;
  }) {
    this.io.to(`project-${projectId}`).emit('job-status', data);
  }

  /**
   * Send job progress update to all users in a project room
   */
  sendProjectJobProgress(projectId: string, data: {
    jobId: string;
    jobType: string;
    progress: number;
    message: string;
    stage: string;
    data?: any;
  }) {
    this.io.to(`project-${projectId}`).emit('job-progress', data);
  }

  /**
   * Send workflow progress update to a specific user
   */
  sendWorkflowProgress(userId: string, data: {
    workflowId: string;
    projectId: string;
    stage: string;
    progress: number;
    message: string;
    stageProgress?: {
      current: number;
      total: number;
      currentItem?: string;
    };
    error?: string;
  }) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('workflow-progress', data);
    }
  }

  /**
   * Send workflow progress update to all users in a project room
   */
  sendProjectWorkflowProgress(projectId: string, data: {
    workflowId: string;
    projectId: string;
    stage: string;
    progress: number;
    message: string;
    stageProgress?: {
      current: number;
      total: number;
      currentItem?: string;
    };
    error?: string;
  }) {
    this.io.to(`project-${projectId}`).emit('workflow-progress', data);
  }

  /**
   * Send workflow status update to a specific user
   */
  sendWorkflowStatus(userId: string, data: {
    workflowId: string;
    projectId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    currentStage: string;
    progress: number;
    startedAt: Date;
    completedAt?: Date;
    error?: string;
  }) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('workflow-status', data);
    }
  }

  /**
   * Send workflow status update to all users in a project room
   */
  sendProjectWorkflowStatus(projectId: string, data: {
    workflowId: string;
    projectId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    currentStage: string;
    progress: number;
    startedAt: Date;
    completedAt?: Date;
    error?: string;
  }) {
    this.io.to(`project-${projectId}`).emit('workflow-status', data);
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}

// Singleton instance
let webSocketService: WebSocketService | null = null;

export const initializeWebSocketService = (server: HTTPServer): WebSocketService => {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
  }
  return webSocketService;
};

export const getWebSocketService = (): WebSocketService | null => {
  return webSocketService;
};
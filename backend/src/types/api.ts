// Backend API type definitions
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
  timestamp: Date;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}
export interface Conversation {
  id: string; // Lexical sort of uidA_uidB for deterministic 1-on-1 chats
  participants: Record<string, boolean>; // { [uid]: true }
  lastMessage: string; // Encrypted text snippet for conversation list
  updatedAt: number; // Timestamp
}

export type MessageType = 'text' | 'voice' | 'image' | 'file' | 'deleted';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface Message {
  id: string; // Push ID from Firebase
  senderId: string;
  content: string; // Fully Encrypted string
  type: MessageType;
  status: MessageStatus;
  timestamp: number;
  quotedMessageId?: string; // Optional reply to
  reactions?: Record<string, string>; // { [uid]: emoji }
  isEdited?: boolean; // Flag for edited messages
}

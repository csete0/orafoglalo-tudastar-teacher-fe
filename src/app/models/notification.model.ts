export interface Notification {
  notificationId: number;
  userNotificationId: number;
  iconTypeId?: number;
  title: string;
  content: string;
  actionUrl?: string;
  createdAt?: Date;
  expiryDate?: Date;
  isRead?: boolean;
  readAt?: Date;
}

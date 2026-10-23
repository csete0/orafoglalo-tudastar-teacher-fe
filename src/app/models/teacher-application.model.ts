export interface ApplyTeacherRequest {
  motivation: string;
  institutionName?: string;
}

export interface TeacherApplicationDto {
  id: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  motivation: string;
  institutionName?: string;
  createdAt: string;
  decidedAt?: string;
  rejectionReason?: string;
}

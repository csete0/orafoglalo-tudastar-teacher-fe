export interface CreateInstitutionalInquiryRequest {
  schoolName: string;
  contactName: string;
  email: string;
  phone?: string;
  estimatedStudents?: number;
  message?: string;
  turnstileToken: string;
}

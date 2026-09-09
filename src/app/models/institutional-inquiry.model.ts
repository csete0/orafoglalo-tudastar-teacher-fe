export interface CreateInstitutionalInquiryRequest {
  schoolName: string;
  contactName: string;
  email: string;
  phone?: string;
  estimatedStudents?: number;
  message?: string;
  turnstileToken: string;
}

export interface InstitutionalInquiryDto {
  id: number;
  schoolName: string;
  contactName: string;
  email: string;
  phone?: string;
  estimatedStudents?: number;
  message?: string;
  createdAt: string;
  isHandled: boolean;
  handledAt?: string;
  note?: string;
}

export interface InstitutionalInquiryListDto {
  items: InstitutionalInquiryDto[];
  totalCount: number;
}

import { apiRequest, queryClient } from "./queryClient";

export interface CreateReportResponse {
  reportId: string;
  status: string;
}

export async function createAnalysisReport(propertyInput: string): Promise<CreateReportResponse> {
  // Detect if input is a URL or an address
  const isUrl = propertyInput.includes('redfin.com') || propertyInput.includes('redf.in') || propertyInput.startsWith('http');

  const payload = isUrl
    ? { inputType: 'url' as const, propertyUrl: propertyInput }
    : { inputType: 'address' as const, propertyAddress: propertyInput };

  const response = await apiRequest("POST", "/api/reports", payload);
  return response.json();
}

export async function getAnalysisReport(reportId: string) {
  const response = await apiRequest("GET", `/api/reports/${reportId}`);
  return response.json();
}

export function invalidateReportQueries(reportId?: string) {
  if (reportId) {
    queryClient.invalidateQueries({ queryKey: ['/api/reports', reportId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
  }
}

export async function sendReportChatMessage(
  reportId: string,
  message: string,
  history: { role: 'user' | 'model', parts: [{ text: string }] }[] = []
): Promise<{ reply: string }> {
  // Using native fetch here to easily pass body without full queryClient wrapper types if complex
  const response = await fetch(`/api/reports/${reportId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to send message');
  }

  return response.json();
}

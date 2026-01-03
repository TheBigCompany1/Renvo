import { z } from "zod";

// Most common disposable/temporary email domains to block (lighter list)
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  // Most popular temporary email services
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerillamail.com', '10minutemail.com',
  'temp-mail.org', 'tempmail.eu', 'yopmail.com', 'discard.email', 'maildrop.cc',
  'trashmail.com', 'throwawayemailaddresses.com', 'mailcatch.com', 'sharklasers.com',
  'getnada.com', 'tempmail2.com', 'emailondeck.com', 'mohmal.com', 'emkei.cz'
]);

/**
 * Checks if an email domain is from a known disposable email provider
 */
export function isDisposableEmailDomain(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Validates email with light restrictions (basic format + blocks obvious disposable emails)
 */
export function validateEmailLegitimacy(email: string): {
  isValid: boolean;
  reason?: string;
  suggestion?: string;
} {
  const domain = email.toLowerCase().split('@')[1];
  
  if (!domain) {
    return {
      isValid: false,
      reason: "Invalid email format",
      suggestion: "Please enter a valid email address"
    };
  }
  
  // Only block the most obvious disposable email services
  if (isDisposableEmailDomain(email)) {
    return {
      isValid: false,
      reason: "Temporary email addresses are not allowed",
      suggestion: "Please use a permanent email address"
    };
  }
  
  // Accept all other domains - corporate, personal, international, etc.
  return { isValid: true };
}

/**
 * Zod validator for emails with light validation
 */
export const legitimateEmailValidator = z.string()
  .transform(email => email.trim().toLowerCase())
  .pipe(
    z.string()
      .email("Please enter a valid email address")
      .refine((email) => {
        const validation = validateEmailLegitimacy(email);
        return validation.isValid;
      }, (email) => {
        const validation = validateEmailLegitimacy(email);
        const message = validation.reason || "Please use a legitimate email address";
        const suggestion = validation.suggestion ? ` — ${validation.suggestion}` : "";
        return { message: message + suggestion };
      })
  );
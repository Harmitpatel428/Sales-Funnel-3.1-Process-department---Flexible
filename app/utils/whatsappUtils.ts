/**
 * Centralized WhatsApp utility functions
 * Handles all WhatsApp operations with proper error handling and fallbacks
 */

export interface WhatsAppOptions {
  phoneNumber: string;
  message?: string;
  fallbackToWeb?: boolean;
  timeout?: number;
}

export interface WhatsAppResult {
  success: boolean;
  method: 'desktop' | 'web' | 'failed';
  error?: string;
}

/**
 * Validates and cleans phone number
 */
export const cleanPhoneNumber = (phone: string): string => {
  return phone.replace(/\D/g, '');
};

/**
 * Validates phone number format (Indian mobile numbers)
 */
export const validatePhoneNumber = (phone: string): boolean => {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned.length === 10 && /^[6-9]/.test(cleaned);
};

/**
 * Gets the main phone number from lead data
 */
export const getMainPhoneNumber = (lead: any): string | null => {
  if (!lead) return null;
  
  // Try to get main number from mobileNumbers array
  const mainNumber = lead.mobileNumbers?.find((m: any) => m.isMain)?.number;
  if (mainNumber) return mainNumber;
  
  // Fallback to first number in array
  const firstNumber = lead.mobileNumbers?.[0]?.number;
  if (firstNumber) return firstNumber;
  
  // Fallback to legacy mobileNumber field
  return lead.mobileNumber || null;
};

/**
 * Opens WhatsApp with proper error handling and fallbacks
 */
export const openWhatsApp = async (options: WhatsAppOptions): Promise<WhatsAppResult> => {
  const {
    phoneNumber,
    message = '',
    fallbackToWeb = true,
    timeout = 2000
  } = options;

  // Validate phone number
  const cleanedNumber = cleanPhoneNumber(phoneNumber);
  if (!validatePhoneNumber(cleanedNumber)) {
    return {
      success: false,
      method: 'failed',
      error: 'Invalid phone number format'
    };
  }

  // Encode message for URL
  const encodedMessage = encodeURIComponent(message);
  
  // Create URLs
  const whatsappDesktopUrl = `whatsapp://send?phone=91${cleanedNumber}&text=${encodedMessage}`;
  const whatsappWebUrl = `https://wa.me/91${cleanedNumber}?text=${encodedMessage}`;

  // Try desktop app first
  const desktopResult = await tryDesktopApp(whatsappDesktopUrl, timeout);
  
  if (desktopResult.success) {
    return {
      success: true,
      method: 'desktop'
    };
  }

  // Fallback to web version if enabled
  if (fallbackToWeb) {
    const webResult = await tryWebApp(whatsappWebUrl);
    return webResult;
  }

  return {
    success: false,
    method: 'failed',
    error: 'Desktop app not available and web fallback disabled'
  };
};

/**
 * Attempts to open WhatsApp desktop app
 */
const tryDesktopApp = async (url: string, timeout: number): Promise<WhatsAppResult> => {
  return new Promise((resolve) => {
    let resolved = false;
    
    // Method 1: Try with temporary link
    try {
      const link = document.createElement('a');
      link.href = url;
      link.style.display = 'none';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.warn('Desktop app link method failed:', error);
    }

    // Method 2: Try with iframe (more reliable)
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);

      // Clean up iframe after timeout
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    } catch (error) {
      console.warn('Desktop app iframe method failed:', error);
    }

    // Set timeout to detect if desktop app opened
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          method: 'desktop',
          error: 'Desktop app not detected'
        });
      }
    }, timeout);
  });
};

/**
 * Opens WhatsApp web version
 */
const tryWebApp = async (url: string): Promise<WhatsAppResult> => {
  try {
    window.open(url, '_blank');
    return {
      success: true,
      method: 'web'
    };
  } catch (error) {
    return {
      success: false,
      method: 'web',
      error: `Failed to open web version: ${error}`
    };
  }
};

/**
 * Sanitizes HTML content to plain text
 */
export const sanitizeContent = (content: string): string => {
  if (!content || content.trim() === '') return '';
  
  // Create a temporary div to extract text content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  const plainText = tempDiv.textContent || tempDiv.innerText || '';
  
  return plainText.trim();
};

/**
 * Checks if template has valid content
 */
export const hasValidContent = (content: string): boolean => {
  const sanitized = sanitizeContent(content);
  return sanitized.length > 0;
};

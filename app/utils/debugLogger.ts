/**
 * Debug logging utility with environment-based controls
 * 
 * Provides controlled debug logging that can be enabled/disabled via
 * environment variables and runtime configuration.
 */

// Debug categories
export enum DebugCategory {
  STORAGE = 'storage',
  FILTERS = 'filters',
  VALIDATION = 'validation',
  ENCRYPTION = 'encryption',
  NAVIGATION = 'navigation',
  PERFORMANCE = 'performance',
  GENERAL = 'general'
}

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}

interface DebugConfig {
  enabled: boolean;
  categories: Set<DebugCategory>;
  level: LogLevel;
  maxLogs: number;
  enableConsole: boolean;
  enableStorage: boolean;
}

class DebugLogger {
  private config: DebugConfig = {
    enabled: false,
    categories: new Set(),
    level: LogLevel.ERROR,
    maxLogs: 1000,
    enableConsole: true,
    enableStorage: false
  };

  private logs: Array<{
    timestamp: number;
    category: DebugCategory;
    level: LogLevel;
    message: string;
    data?: any;
  }> = [];

  constructor() {
    this.initializeFromEnvironment();
  }

  /**
   * Initialize debug configuration from environment variables
   */
  private initializeFromEnvironment(): void {
    // Check for debug flags
    const debugStorage = process.env.NEXT_PUBLIC_DEBUG_STORAGE === 'true';
    const debugFilters = process.env.NEXT_PUBLIC_DEBUG_FILTERS === 'true';
    const debugValidation = process.env.NEXT_PUBLIC_DEBUG_VALIDATION === 'true';
    const debugEncryption = process.env.NEXT_PUBLIC_DEBUG_ENCRYPTION === 'true';
    const debugNavigation = process.env.NEXT_PUBLIC_DEBUG_NAVIGATION === 'true';
    const debugPerformance = process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === 'true';
    const debugGeneral = process.env.NEXT_PUBLIC_DEBUG_GENERAL === 'true';

    // Check for global debug flag
    const debugAll = process.env.NEXT_PUBLIC_DEBUG_ALL === 'true' || 
                     process.env.NODE_ENV === 'development';

    // Set enabled categories
    if (debugAll || debugStorage) this.config.categories.add(DebugCategory.STORAGE);
    if (debugAll || debugFilters) this.config.categories.add(DebugCategory.FILTERS);
    if (debugAll || debugValidation) this.config.categories.add(DebugCategory.VALIDATION);
    if (debugAll || debugEncryption) this.config.categories.add(DebugCategory.ENCRYPTION);
    if (debugAll || debugNavigation) this.config.categories.add(DebugCategory.NAVIGATION);
    if (debugAll || debugPerformance) this.config.categories.add(DebugCategory.PERFORMANCE);
    if (debugAll || debugGeneral) this.config.categories.add(DebugCategory.GENERAL);

    // Set log level
    const logLevel = process.env.NEXT_PUBLIC_DEBUG_LEVEL;
    if (logLevel) {
      switch (logLevel.toLowerCase()) {
        case 'error': this.config.level = LogLevel.ERROR; break;
        case 'warn': this.config.level = LogLevel.WARN; break;
        case 'info': this.config.level = LogLevel.INFO; break;
        case 'debug': this.config.level = LogLevel.DEBUG; break;
        case 'verbose': this.config.level = LogLevel.VERBOSE; break;
        default: this.config.level = LogLevel.ERROR;
      }
    } else {
      this.config.level = debugAll ? LogLevel.DEBUG : LogLevel.ERROR;
    }

    // Enable if any categories are set
    this.config.enabled = this.config.categories.size > 0;

    // Console logging (always enabled in development)
    this.config.enableConsole = process.env.NODE_ENV === 'development' || 
                                process.env.NEXT_PUBLIC_DEBUG_CONSOLE === 'true';

    // Storage logging (disabled by default)
    this.config.enableStorage = process.env.NEXT_PUBLIC_DEBUG_STORAGE_LOGS === 'true';
  }

  /**
   * Check if debug logging is enabled for a category
   */
  isEnabled(category: DebugCategory): boolean {
    return this.config.enabled && this.config.categories.has(category);
  }

  /**
   * Check if a log level should be output
   */
  shouldLog(level: LogLevel): boolean {
    return this.config.enabled && level <= this.config.level;
  }

  /**
   * Log a debug message
   */
  log(
    category: DebugCategory,
    level: LogLevel,
    message: string,
    data?: any
  ): void {
    if (!this.isEnabled(category) || !this.shouldLog(level)) {
      return;
    }

    const logEntry = {
      timestamp: Date.now(),
      category,
      level,
      message,
      data
    };

    // Add to logs array
    this.logs.unshift(logEntry);
    if (this.logs.length > this.config.maxLogs) {
      this.logs = this.logs.slice(0, this.config.maxLogs);
    }

    // Console output
    if (this.config.enableConsole) {
      this.logToConsole(logEntry);
    }

    // Storage output
    if (this.config.enableStorage) {
      this.logToStorage(logEntry);
    }
  }

  /**
   * Log error message
   */
  error(category: DebugCategory, message: string, data?: any): void {
    this.log(category, LogLevel.ERROR, message, data);
  }

  /**
   * Log warning message
   */
  warn(category: DebugCategory, message: string, data?: any): void {
    this.log(category, LogLevel.WARN, message, data);
  }

  /**
   * Log info message
   */
  info(category: DebugCategory, message: string, data?: any): void {
    this.log(category, LogLevel.INFO, message, data);
  }

  /**
   * Log debug message
   */
  debug(category: DebugCategory, message: string, data?: any): void {
    this.log(category, LogLevel.DEBUG, message, data);
  }

  /**
   * Log verbose message
   */
  verbose(category: DebugCategory, message: string, data?: any): void {
    this.log(category, LogLevel.VERBOSE, message, data);
  }

  /**
   * Get logs for a specific category
   */
  getLogs(category?: DebugCategory, limit: number = 100): Array<typeof this.logs[0]> {
    if (category) {
      return this.logs.filter(log => log.category === category).slice(0, limit);
    }
    return this.logs.slice(0, limit);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs
   */
  exportLogs(): string {
    return JSON.stringify({
      logs: this.logs,
      config: {
        enabled: this.config.enabled,
        categories: Array.from(this.config.categories),
        level: this.config.level,
        timestamp: Date.now()
      }
    }, null, 2);
  }

  /**
   * Log to console with appropriate level
   */
  private logToConsole(logEntry: typeof this.logs[0]): void {
    const timestamp = new Date(logEntry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${logEntry.category.toUpperCase()}]`;
    const message = `${prefix} ${logEntry.message}`;

    switch (logEntry.level) {
      case LogLevel.ERROR:
        console.error(message, logEntry.data);
        break;
      case LogLevel.WARN:
        console.warn(message, logEntry.data);
        break;
      case LogLevel.INFO:
        console.info(message, logEntry.data);
        break;
      case LogLevel.DEBUG:
        console.debug(message, logEntry.data);
        break;
      case LogLevel.VERBOSE:
        console.log(message, logEntry.data);
        break;
    }
  }

  /**
   * Log to localStorage (for debugging)
   */
  private logToStorage(logEntry: typeof this.logs[0]): void {
    try {
      const storageKey = `_debug_logs_${logEntry.category}`;
      const existingLogs = localStorage.getItem(storageKey);
      let logs = [];
      if (existingLogs) {
        try {
          logs = JSON.parse(existingLogs);
        } catch (parseError) {
          console.warn('Debug logs corrupted, starting fresh');
          logs = [];
        }
      }
      
      logs.unshift(logEntry);
      
      // Keep only last 100 logs per category
      if (logs.length > 100) {
        logs.splice(100);
      }
      
      localStorage.setItem(storageKey, JSON.stringify(logs));
    } catch (error) {
      console.warn('Failed to save debug log to storage:', error);
    }
  }
}

// Export singleton instance
export const debugLogger = new DebugLogger();

// Export convenience functions
export const debugStorage = (message: string, data?: any) => {
  debugLogger.debug(DebugCategory.STORAGE, message, data);
};

export const debugFilters = (message: string, data?: any) => {
  debugLogger.debug(DebugCategory.FILTERS, message, data);
};

export const debugValidation = (message: string, data?: any) => {
  debugLogger.debug(DebugCategory.VALIDATION, message, data);
};

export const debugEncryption = (message: string, data?: any) => {
  debugLogger.debug(DebugCategory.ENCRYPTION, message, data);
};

export const debugNavigation = (message: string, data?: any) => {
  debugLogger.debug(DebugCategory.NAVIGATION, message, data);
};

export const debugPerformance = (message: string, data?: any) => {
  debugLogger.debug(DebugCategory.PERFORMANCE, message, data);
};

export const debugGeneral = (message: string, data?: any) => {
  debugLogger.debug(DebugCategory.GENERAL, message, data);
};

// Export conditional logging functions
export const logStorage = (message: string, data?: any) => {
  if (debugLogger.isEnabled(DebugCategory.STORAGE)) {
    debugLogger.info(DebugCategory.STORAGE, message, data);
  }
};

export const logFilters = (message: string, data?: any) => {
  if (debugLogger.isEnabled(DebugCategory.FILTERS)) {
    debugLogger.info(DebugCategory.FILTERS, message, data);
  }
};

export const logValidation = (message: string, data?: any) => {
  if (debugLogger.isEnabled(DebugCategory.VALIDATION)) {
    debugLogger.info(DebugCategory.VALIDATION, message, data);
  }
};

export const logEncryption = (message: string, data?: any) => {
  if (debugLogger.isEnabled(DebugCategory.ENCRYPTION)) {
    debugLogger.info(DebugCategory.ENCRYPTION, message, data);
  }
};

export const logNavigation = (message: string, data?: any) => {
  if (debugLogger.isEnabled(DebugCategory.NAVIGATION)) {
    debugLogger.info(DebugCategory.NAVIGATION, message, data);
  }
};

export const logPerformance = (message: string, data?: any) => {
  if (debugLogger.isEnabled(DebugCategory.PERFORMANCE)) {
    debugLogger.info(DebugCategory.PERFORMANCE, message, data);
  }
};

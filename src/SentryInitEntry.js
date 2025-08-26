class SentryInitEntry {
  constructor(initConfig, nickname, id = null) {
    // If initConfig is a string, treat it as DSN for backward compatibility
    if (typeof initConfig === 'string') {
      this.initConfig = { dsn: initConfig };
    } else {
      this.initConfig = { ...initConfig };
    }
    
    this.nickname = nickname;
    this.id = id || Math.floor(Math.random() * 1000000);
  }

  getDsn() {
    return this.initConfig.dsn;
  }

  getNickname() {
    return this.nickname;
  }

  getInitConfig() {
    return { ...this.initConfig };
  }

  getDisplayString() {
    return `[${this.nickname}] ${this.initConfig.dsn}`;
  }

  swapPort(newPort = 3001) {
    try {
      const url = new URL(this.initConfig.dsn);
      url.port = newPort;
      const newConfig = { ...this.initConfig, dsn: url.toString() };
      return new SentryInitEntry(newConfig, this.nickname, this.id);
    } catch (error) {
      console.error('Invalid DSN URL:', this.initConfig.dsn);
      return this;
    }
  }

  addPort(port = 3001) {
    try {
      const url = new URL(this.initConfig.dsn);
      if (!url.port) {
        url.port = port;
        const newConfig = { ...this.initConfig, dsn: url.toString() };
        return new SentryInitEntry(newConfig, this.nickname, this.id);
      }
      return this;
    } catch (error) {
      console.error('Invalid DSN URL:', this.initConfig.dsn);
      return this;
    }
  }

  toJSON() {
    return {
      initConfig: this.initConfig,
      nickname: this.nickname,
      id: this.id
    };
  }

  static fromJSON(json) {
    // Handle backward compatibility with old DSNEntry format
    if (json.dsn && !json.initConfig) {
      return new SentryInitEntry(json.dsn, json.nickname, json.id);
    }
    return new SentryInitEntry(json.initConfig, json.nickname, json.id);
  }

  static createDefault() {
    const defaultConfig = {
      dsn: 'https://73acf70525a17b22d278f2514e483e48@o408219.ingest.us.sentry.io/4509878521167872',
      Integrations: [],
      tracesSampleRate: 1.0,
      tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
      enableLogs: true,
    };
    return new SentryInitEntry(defaultConfig, 'Default');
  }
}

export default SentryInitEntry;

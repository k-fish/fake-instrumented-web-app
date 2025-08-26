class DSNEntry {
  constructor(dsn, nickname, id = null) {
    this.dsn = dsn;
    this.nickname = nickname;
    this.id = id || Math.floor(Math.random() * 1000000);
  }

  getDsn() {
    return this.dsn;
  }

  getNickname() {
    return this.nickname;
  }

  getDisplayString() {
    return `[${this.nickname}] ${this.dsn}`;
  }

  swapPort(newPort = 3001) {
    try {
      const url = new URL(this.dsn);
      url.port = newPort;
      return new DSNEntry(url.toString(), this.nickname, this.id);
    } catch (error) {
      console.error('Invalid DSN URL:', this.dsn);
      return this;
    }
  }

  addPort(port = 3001) {
    try {
      const url = new URL(this.dsn);
      if (!url.port) {
        url.port = port;
        return new DSNEntry(url.toString(), this.nickname, this.id);
      }
      return this;
    } catch (error) {
      console.error('Invalid DSN URL:', this.dsn);
      return this;
    }
  }

  toJSON() {
    return {
      dsn: this.dsn,
      nickname: this.nickname,
      id: this.id
    };
  }

  static fromJSON(json) {
    return new DSNEntry(json.dsn, json.nickname, json.id);
  }
}

export default DSNEntry;

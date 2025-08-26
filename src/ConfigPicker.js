import React, { useState, useEffect } from 'react';
import SentryInitEntry from './SentryInitEntry';

const ConfigPicker = () => {
  const [configEntries, setConfigEntries] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [formNickname, setFormNickname] = useState('');
  const [formDsn, setFormDsn] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadConfigEntries();
  }, []);

  const loadConfigEntries = () => {
    const stored = localStorage.getItem('sentryConfigEntries');
    const currentDsn = localStorage.getItem('currentDsn');
    
    if (stored) {
      const entries = JSON.parse(stored).map(entry => SentryInitEntry.fromJSON(entry));
      setConfigEntries(entries);
      
      if (currentDsn) {
        const selectedEntry = entries.find(entry => entry.getDsn() === currentDsn);
        if (selectedEntry) {
          setSelectedConfigId(selectedEntry.id.toString());
        }
      }
    } else {
      // Check for old dsnEntries and migrate
      const oldStored = localStorage.getItem('dsnEntries');
      let defaultEntries;
      
      if (oldStored) {
        // Migrate old entries
        const oldEntries = JSON.parse(oldStored);
        defaultEntries = oldEntries.map(entry => SentryInitEntry.fromJSON(entry));
        localStorage.removeItem('dsnEntries'); // Clean up old storage
      } else {
        // Initialize with default entries from index.js
        defaultEntries = [
          new SentryInitEntry('https://e548fcedc35a3a0d2bd712212f3df50b@o4507154197774336.ingest.de.sentry.io/4509078681747536', 'EU'),
          new SentryInitEntry('http://e0bc3e6090a4f8a822108aff6fd15a86@sentry.dev.getsentry.net:8000/2', 'Local 2'),
          new SentryInitEntry('http://072dda62717bd34a1457af2c28e7494b@sentry.dev.getsentry.net:8000/4', 'Local'),
          new SentryInitEntry('https://0a7473685132dfcf2fbb9352c32d308d@sentry.my.sentry.io/4508728444321793', 'My Sentry'),
          new SentryInitEntry('https://b8793daed00c88032f55a4649b1e85a8@o1.ingest.us.sentry.io/4508892109012993', 'KFish'),
          new SentryInitEntry('https://1238b05a4527146d02d1608e205128e7@o447951.ingest.us.sentry.io/4508920403722240', 'Abhi'),
          new SentryInitEntry('http://ca8c0eadaed7c908e266b0506371cf78@sentry.dev.getsentry.net:8000/2', 'New Local'),
          new SentryInitEntry('https://73acf70525a17b22d278f2514e483e48@o408219.ingest.us.sentry.io/4509878521167872', 'Magikrop'),
          new SentryInitEntry('http://6ffbcc9a36d21d024ee8b2d487c7f0d3@sentry.dev.getsentry.net:3001/2', 'Local Via Proxy')
        ];
      }
      
      setConfigEntries(defaultEntries);
      saveConfigEntries(defaultEntries);
    }
  };

  const saveConfigEntries = (entries) => {
    localStorage.setItem('sentryConfigEntries', JSON.stringify(entries.map(entry => entry.toJSON())));
  };

  const handleConfigSelect = (entryId) => {
    const selectedEntry = configEntries.find(entry => entry.id.toString() === entryId);
    if (selectedEntry) {
      setSelectedConfigId(entryId);
      localStorage.setItem('currentDsn', selectedEntry.getDsn());
      localStorage.setItem('currentSentryConfig', JSON.stringify(selectedEntry.getInitConfig()));
      window.location.reload();
    }
  };

  const handleSaveConfig = () => {
    if (!formNickname.trim() || !formDsn.trim()) {
      alert('Both nickname and DSN are required');
      return;
    }

    let updatedEntries;
    if (editingId) {
      // Edit existing entry
      updatedEntries = configEntries.map(entry => 
        entry.id === editingId 
          ? new SentryInitEntry(formDsn.trim(), formNickname.trim(), editingId)
          : entry
      );
    } else {
      // Add new entry
      const newEntry = new SentryInitEntry(formDsn.trim(), formNickname.trim());
      updatedEntries = [...configEntries, newEntry];
      // Switch to the new config
      setSelectedConfigId(newEntry.id.toString());
      localStorage.setItem('currentDsn', newEntry.getDsn());
      localStorage.setItem('currentSentryConfig', JSON.stringify(newEntry.getInitConfig()));
    }
    
    setConfigEntries(updatedEntries);
    saveConfigEntries(updatedEntries);
    
    // Reset form
    setFormNickname('');
    setFormDsn('');
    setShowForm(false);
    setEditingId(null);
    
    // Reload if we added a new entry or edited the current one
    if (!editingId || editingId.toString() === selectedConfigId) {
      window.location.reload();
    }
  };

  const handleEditConfig = (entry) => {
    setFormNickname(entry.getNickname());
    setFormDsn(entry.getDsn());
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDeleteConfig = (entryId) => {
    if (configEntries.length <= 1) {
      alert('Cannot delete the last config entry');
      return;
    }
    
    const updatedEntries = configEntries.filter(entry => entry.id !== entryId);
    setConfigEntries(updatedEntries);
    saveConfigEntries(updatedEntries);
    
    // If we deleted the selected config, select the first one
    if (entryId.toString() === selectedConfigId) {
      const firstEntry = updatedEntries[0];
      setSelectedConfigId(firstEntry.id.toString());
      localStorage.setItem('currentDsn', firstEntry.getDsn());
      localStorage.setItem('currentSentryConfig', JSON.stringify(firstEntry.getInitConfig()));
      window.location.reload();
    }
  };

  const handlePortSwap = (entryId, usePort3001) => {
    const entryIndex = configEntries.findIndex(entry => entry.id === entryId);
    if (entryIndex === -1) return;
    
    const entry = configEntries[entryIndex];
    const updatedEntry = usePort3001 ? entry.swapPort(3001) : entry.addPort(3001);
    
    const updatedEntries = [...configEntries];
    updatedEntries[entryIndex] = updatedEntry;
    setConfigEntries(updatedEntries);
    saveConfigEntries(updatedEntries);
    
    // If this is the currently selected config, update it and reload
    if (selectedConfigId === entryId.toString()) {
      localStorage.setItem('currentDsn', updatedEntry.getDsn());
      localStorage.setItem('currentSentryConfig', JSON.stringify(updatedEntry.getInitConfig()));
      window.location.reload();
    }
  };

  const cancelForm = () => {
    setFormNickname('');
    setFormDsn('');
    setShowForm(false);
    setEditingId(null);
  };

  const getSelectedEntry = () => {
    return configEntries.find(entry => entry.id.toString() === selectedConfigId);
  };

  const selectedEntry = getSelectedEntry();

  return (
    <div className="config-picker">
      <div className="config-accordion">
        <div 
          className="config-accordion-header"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h4>Sentry Configuration</h4>
          <div className="config-current">
            {selectedEntry ? (
              <span>[{selectedEntry.getNickname()}] {selectedEntry.getDsn()}</span>
            ) : (
              <span>No config selected</span>
            )}
          </div>
          <span className={`accordion-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
        </div>

        {isExpanded && (
          <div className="config-accordion-content">
            <div className="config-list">
              {configEntries.map((entry) => (
                <div key={entry.id} className="config-entry">
                  <div className="config-main-row">
                    <div className="config-radio">
                      <input
                        type="radio"
                        id={`config-${entry.id}`}
                        name="config-selection"
                        checked={selectedConfigId === entry.id.toString()}
                        onChange={() => handleConfigSelect(entry.id.toString())}
                      />
                      <label htmlFor={`config-${entry.id}`} className="config-label">
                        {entry.getDisplayString()}
                      </label>
                    </div>
                    <div className="config-actions">
                      <button 
                        data-button-size="sm" 
                        onClick={() => handleEditConfig(entry)}
                      >
                        Edit
                      </button>
                      <button 
                        data-button-size="sm" 
                        onClick={() => handleDeleteConfig(entry.id)}
                        disabled={configEntries.length <= 1}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="config-controls">
                    <label>
                      <input
                        type="checkbox"
                        onChange={(e) => handlePortSwap(entry.id, e.target.checked)}
                        checked={entry.getDsn().includes(':3001')}
                      />
                      Port 3001
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="config-form-section">
              {!showForm ? (
                <button 
                  data-button-size="sm" 
                  onClick={() => setShowForm(true)}
                  className="add-config-button"
                >
                  Add New Config
                </button>
              ) : (
                <div className="config-form">
                  <h5>{editingId ? 'Edit Config' : 'Add New Config'}</h5>
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="Nickname"
                      value={formNickname}
                      onChange={(e) => setFormNickname(e.target.value)}
                      className="nickname-input"
                    />
                    <input
                      type="text"
                      placeholder="DSN URL"
                      value={formDsn}
                      onChange={(e) => setFormDsn(e.target.value)}
                      className="dsn-input"
                    />
                  </div>
                  <div className="form-buttons">
                    <button data-button-size="sm" onClick={handleSaveConfig}>
                      {editingId ? 'Update' : 'Save'}
                    </button>
                    <button data-button-size="sm" onClick={cancelForm}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigPicker;

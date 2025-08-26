import React, { useState, useEffect } from 'react';
import DSNEntry from './DSNEntry';

const DSNPicker = () => {
  const [dsnEntries, setDsnEntries] = useState([]);
  const [selectedDsnId, setSelectedDsnId] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [formNickname, setFormNickname] = useState('');
  const [formDsn, setFormDsn] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadDsnEntries();
  }, []);

  const loadDsnEntries = () => {
    const stored = localStorage.getItem('dsnEntries');
    const currentDsn = localStorage.getItem('currentDsn');
    
    if (stored) {
      const entries = JSON.parse(stored).map(entry => DSNEntry.fromJSON(entry));
      setDsnEntries(entries);
      
      if (currentDsn) {
        const selectedEntry = entries.find(entry => entry.getDsn() === currentDsn);
        if (selectedEntry) {
          setSelectedDsnId(selectedEntry.id.toString());
        }
      }
    } else {
      // Initialize with default entries from index.js
      const defaultEntries = [
        new DSNEntry('https://e548fcedc35a3a0d2bd712212f3df50b@o4507154197774336.ingest.de.sentry.io/4509078681747536', 'EU'),
        new DSNEntry('http://e0bc3e6090a4f8a822108aff6fd15a86@sentry.dev.getsentry.net:8000/2', 'Local 2'),
        new DSNEntry('http://072dda62717bd34a1457af2c28e7494b@sentry.dev.getsentry.net:8000/4', 'Local'),
        new DSNEntry('https://0a7473685132dfcf2fbb9352c32d308d@sentry.my.sentry.io/4508728444321793', 'My Sentry'),
        new DSNEntry('https://b8793daed00c88032f55a4649b1e85a8@o1.ingest.us.sentry.io/4508892109012993', 'KFish'),
        new DSNEntry('https://1238b05a4527146d02d1608e205128e7@o447951.ingest.us.sentry.io/4508920403722240', 'Abhi'),
        new DSNEntry('http://ca8c0eadaed7c908e266b0506371cf78@sentry.dev.getsentry.net:8000/2', 'New Local'),
        new DSNEntry('https://73acf70525a17b22d278f2514e483e48@o408219.ingest.us.sentry.io/4509878521167872', 'Magikrop'),
        new DSNEntry('http://6ffbcc9a36d21d024ee8b2d487c7f0d3@sentry.dev.getsentry.net:3001/2', 'Local Via Proxy')
      ];
      setDsnEntries(defaultEntries);
      saveDsnEntries(defaultEntries);
    }
  };

  const saveDsnEntries = (entries) => {
    localStorage.setItem('dsnEntries', JSON.stringify(entries.map(entry => entry.toJSON())));
  };

  const handleDsnSelect = (entryId) => {
    const selectedEntry = dsnEntries.find(entry => entry.id.toString() === entryId);
    if (selectedEntry) {
      setSelectedDsnId(entryId);
      localStorage.setItem('currentDsn', selectedEntry.getDsn());
      window.location.reload();
    }
  };

  const handleSaveDsn = () => {
    if (!formNickname.trim() || !formDsn.trim()) {
      alert('Both nickname and DSN are required');
      return;
    }

    let updatedEntries;
    if (editingId) {
      // Edit existing entry
      updatedEntries = dsnEntries.map(entry => 
        entry.id === editingId 
          ? new DSNEntry(formDsn.trim(), formNickname.trim(), editingId)
          : entry
      );
    } else {
      // Add new entry
      const newEntry = new DSNEntry(formDsn.trim(), formNickname.trim());
      updatedEntries = [...dsnEntries, newEntry];
      // Switch to the new DSN
      setSelectedDsnId(newEntry.id.toString());
      localStorage.setItem('currentDsn', newEntry.getDsn());
    }
    
    setDsnEntries(updatedEntries);
    saveDsnEntries(updatedEntries);
    
    // Reset form
    setFormNickname('');
    setFormDsn('');
    setShowForm(false);
    setEditingId(null);
    
    // Reload if we added a new entry or edited the current one
    if (!editingId || editingId.toString() === selectedDsnId) {
      window.location.reload();
    }
  };

  const handleEditDsn = (entry) => {
    setFormNickname(entry.getNickname());
    setFormDsn(entry.getDsn());
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDeleteDsn = (entryId) => {
    if (dsnEntries.length <= 1) {
      alert('Cannot delete the last DSN entry');
      return;
    }
    
    const updatedEntries = dsnEntries.filter(entry => entry.id !== entryId);
    setDsnEntries(updatedEntries);
    saveDsnEntries(updatedEntries);
    
    // If we deleted the selected DSN, select the first one
    if (entryId.toString() === selectedDsnId) {
      const firstEntry = updatedEntries[0];
      setSelectedDsnId(firstEntry.id.toString());
      localStorage.setItem('currentDsn', firstEntry.getDsn());
      window.location.reload();
    }
  };

  const handlePortSwap = (entryId, usePort3001) => {
    const entryIndex = dsnEntries.findIndex(entry => entry.id === entryId);
    if (entryIndex === -1) return;
    
    const entry = dsnEntries[entryIndex];
    const updatedEntry = usePort3001 ? entry.swapPort(3001) : entry.addPort(3001);
    
    const updatedEntries = [...dsnEntries];
    updatedEntries[entryIndex] = updatedEntry;
    setDsnEntries(updatedEntries);
    saveDsnEntries(updatedEntries);
    
    // If this is the currently selected DSN, update it and reload
    if (selectedDsnId === entryId.toString()) {
      localStorage.setItem('currentDsn', updatedEntry.getDsn());
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
    return dsnEntries.find(entry => entry.id.toString() === selectedDsnId);
  };

  const selectedEntry = getSelectedEntry();

  return (
    <div className="dsn-picker">
      <div className="dsn-accordion">
        <div 
          className="dsn-accordion-header"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h4>DSN Configuration</h4>
          <div className="dsn-current">
            {selectedEntry ? (
              <span>[{selectedEntry.getNickname()}] {selectedEntry.getDsn()}</span>
            ) : (
              <span>No DSN selected</span>
            )}
          </div>
          <span className={`accordion-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
        </div>

        {isExpanded && (
          <div className="dsn-accordion-content">
            <div className="dsn-list">
              {dsnEntries.map((entry) => (
                <div key={entry.id} className="dsn-entry">
                  <div className="dsn-main-row">
                    <div className="dsn-radio">
                      <input
                        type="radio"
                        id={`dsn-${entry.id}`}
                        name="dsn-selection"
                        checked={selectedDsnId === entry.id.toString()}
                        onChange={() => handleDsnSelect(entry.id.toString())}
                      />
                      <label htmlFor={`dsn-${entry.id}`} className="dsn-label">
                        {entry.getDisplayString()}
                      </label>
                    </div>
                    <div className="dsn-actions">
                      <button 
                        data-button-size="sm" 
                        onClick={() => handleEditDsn(entry)}
                      >
                        Edit
                      </button>
                      <button 
                        data-button-size="sm" 
                        onClick={() => handleDeleteDsn(entry.id)}
                        disabled={dsnEntries.length <= 1}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="dsn-controls">
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

            <div className="dsn-form-section">
              {!showForm ? (
                <button 
                  data-button-size="sm" 
                  onClick={() => setShowForm(true)}
                  className="add-dsn-button"
                >
                  Add New DSN
                </button>
              ) : (
                <div className="dsn-form">
                  <h5>{editingId ? 'Edit DSN' : 'Add New DSN'}</h5>
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
                    <button data-button-size="sm" onClick={handleSaveDsn}>
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

export default DSNPicker;

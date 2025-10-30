import React, { useState, useEffect } from 'react';

const API_URL = window.location.origin + '/api';

export default function MonitoringDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [view, setView] = useState('dashboard');
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [formData, setFormData] = useState({});
  const [uploadProgress, setUploadProgress] = useState('');
  const [filterApp, setFilterApp] = useState('');
  const [blink, setBlink] = useState(true);
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('ozone_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadData();
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }
  }, [view, authenticated]);

  useEffect(() => {
    const blinkInterval = setInterval(() => setBlink(prev => !prev), 500);
    return () => clearInterval(blinkInterval);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const users = JSON.parse(localStorage.getItem('ozone_users') || '[]');
    
    if (users.length === 0) {
      const adminUser = {
        username: loginForm.username,
        password: loginForm.password,
        role: 'admin',
        permissions: { dashboard: 'rw', history: 'rw', servers: 'rwd' }
      };
      users.push(adminUser);
      localStorage.setItem('ozone_users', JSON.stringify(users));
      localStorage.setItem('ozone_user', JSON.stringify(adminUser));
      setUser(adminUser);
      setAuthenticated(true);
      return;
    }
    
    const foundUser = users.find(u => u.username === loginForm.username && u.password === loginForm.password);
    if (foundUser) {
      localStorage.setItem('ozone_user', JSON.stringify(foundUser));
      setUser(foundUser);
      setAuthenticated(true);
    } else {
      alert('Invalid credentials');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ozone_user');
    setUser(null);
    setAuthenticated(false);
  };

  const hasPermission = (tab, action) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perm = user.permissions[tab] || '';
    return perm.includes(action);
  };

  const loadData = async () => {
    try {
      if (view === 'dashboard' || view === 'history') {
        const res = await fetch(`${API_URL}/dashboard`);
        const data = await res.json();
        if (view === 'dashboard') {
          setDashboard(data);
        } else {
          setHistory(data);
        }
      }
      if (view === 'servers' || view === 'dashboard') {
        const res = await fetch(`${API_URL}/servers`);
        const data = await res.json();
        setServers(data);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const loadServerDetails = async (serverId) => {
    try {
      const res = await fetch(`${API_URL}/servers/${serverId}`);
      const data = await res.json();
      setSelectedServer(data);
      setView('serverDetail');
    } catch (err) {
      console.error('Failed to load server:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = modalType === 'server' 
        ? `${API_URL}/servers${formData.id ? `/${formData.id}` : ''}`
        : `${API_URL}/applications${formData.id ? `/${formData.id}` : ''}`;
      
      const method = formData.id ? 'PUT' : 'POST';
      
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      setShowModal(false);
      setFormData({});
      loadData();
      if (selectedServer) loadServerDetails(selectedServer.id);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  };

  const handleDelete = async (type, id) => {
    if (!hasPermission('servers', 'd')) {
      alert('Access Denied');
      return;
    }
    if (!window.confirm('Confirm deletion?')) return;
    
    try {
      const url = type === 'server' 
        ? `${API_URL}/servers/${id}`
        : `${API_URL}/applications/${id}`;
      
      await fetch(url, { method: 'DELETE' });
      
      if (type === 'server' && selectedServer && selectedServer.id === id) {
        setView('servers');
        setSelectedServer(null);
      }
      
      loadData();
      if (selectedServer) loadServerDetails(selectedServer.id);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const manualCheck = async (appId) => {
    try {
      await fetch(`${API_URL}/applications/${appId}/check`, { method: 'POST' });
      if (selectedServer) loadServerDetails(selectedServer.id);
      loadData();
    } catch (err) {
      alert('Check failed: ' + err.message);
    }
  };

  const openModal = (type, data = {}) => {
    if (!hasPermission('servers', 'w') && type !== 'user') {
      alert('Access Denied');
      return;
    }
    setModalType(type);
    setFormData(data);
    setShowModal(true);
  };

  const downloadExistingServers = async () => {
    try {
      const res = await fetch(`${API_URL}/servers`);
      const allServers = await res.json();
      
      const rows = [];
      rows.push(['Server Name', 'Server IP', 'App Name', 'Port', 'Health Check', 'Interval', 'Threshold']);
      
      for (const server of allServers) {
        const serverRes = await fetch(`${API_URL}/servers/${server.id}`);
        const serverDetail = await serverRes.json();
        
        if (serverDetail.applications && serverDetail.applications.length > 0) {
          serverDetail.applications.forEach((app, idx) => {
            if (idx === 0) {
              rows.push([
                server.name,
                server.host,
                app.name,
                app.port || '',
                app.health_url || '',
                app.check_interval || 60,
                app.response_threshold || 4000
              ]);
            } else {
              rows.push([
                '',
                '',
                app.name,
                app.port || '',
                app.health_url || '',
                app.check_interval || 60,
                app.response_threshold || 4000
              ]);
            }
          });
        } else {
          rows.push([server.name, server.host, '', '', '', '', '']);
        }
      }
      
      const csv = rows.map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `servers-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleFileUpload = async (e, mode) => {
    if (!hasPermission('servers', mode === 'delete' ? 'd' : 'w')) {
      alert('Access Denied');
      return;
    }
    
    const file = e.target.files[0];
    if (!file) return;

    setUploadProgress('Reading file...');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n');
        
        if (mode === 'delete') {
          await handleDeleteUpload(lines);
        } else {
          await handleAddUpload(lines);
        }
      } catch (err) {
        setUploadProgress('');
        alert('Error: ' + err.message);
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteUpload = async (lines) => {
    setUploadProgress('Processing delete list...');
    let deleted = 0;
    let errors = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const serverName = values[0];
      const serverIP = values[1];
      
      if (serverName || serverIP) {
        try {
          const res = await fetch(`${API_URL}/servers`);
          const allServers = await res.json();
          
          const serverToDelete = allServers.find(s => 
            (serverName && s.name === serverName) || (serverIP && s.host === serverIP)
          );
          
          if (serverToDelete) {
            const delRes = await fetch(`${API_URL}/servers/${serverToDelete.id}`, {
              method: 'DELETE'
            });
            if (delRes.ok) {
              deleted++;
            } else {
              errors++;
            }
          }
        } catch (err) {
          errors++;
        }
      }
    }

    setUploadProgress('');
    alert(`Delete complete: ${deleted} deleted, ${errors} errors`);
    loadData();
  };

  const handleAddUpload = async (lines) => {
    setUploadProgress('Processing add list...');
    let created = 0;
    let errors = 0;
    let currentServer = null;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      
      if (values[0] && values[1]) {
        try {
          const serverRes = await fetch(`${API_URL}/servers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: values[0], host: values[1] })
          });
          if (serverRes.ok) {
            currentServer = await serverRes.json();
          } else {
            errors++;
            continue;
          }
        } catch (err) {
          errors++;
          continue;
        }
      }

      if (currentServer && values[2]) {
        try {
          const appRes = await fetch(`${API_URL}/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              server_id: currentServer.id,
              name: values[2],
              port: values[3] ? parseInt(values[3]) : null,
              health_url: values[4] || null,
              check_interval: values[5] ? parseInt(values[5]) : 60,
              response_threshold: values[6] ? parseInt(values[6]) : 4000
            })
          });
          if (appRes.ok) created++;
          else errors++;
        } catch (err) {
          errors++;
        }
      }
    }

    setUploadProgress('');
    alert(`Upload complete: ${created} created, ${errors} errors`);
    loadData();
  };

  const downloadTemplate = () => {
    const csv = 'Server Name,Server IP,App Name,Port,Health Check,Interval,Threshold\ndashboard,10.230.32.254,dashboard,8082,http://10.230.32.254/health,60,4000\n,,reporting-api,8085,http://10.230.32.254/health,60,4000\nreporting,10.230.21.20,api,8082,http://10.230.21.20/health,60,4000';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template.csv';
    a.click();
  };

  const downloadHistoryCSV = () => {
    if (!history) return;
    
    let filteredChecks = history.recentChecks;
    const now = new Date();
    let startDate = new Date();
    
    if (dateRange === 'today') {
      startDate.setHours(0, 0, 0, 0);
      filteredChecks = filteredChecks.filter(c => new Date(c.checked_at) >= startDate);
    } else if (dateRange === 'week') {
      startDate.setDate(now.getDate() - 7);
      filteredChecks = filteredChecks.filter(c => new Date(c.checked_at) >= startDate);
    } else if (dateRange === 'month') {
      startDate.setMonth(now.getMonth() - 1);
      filteredChecks = filteredChecks.filter(c => new Date(c.checked_at) >= startDate);
    } else if (dateRange === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      filteredChecks = filteredChecks.filter(c => {
        const checkDate = new Date(c.checked_at);
        return checkDate >= start && checkDate <= end;
      });
    }
    
    if (filterApp) {
      filteredChecks = filteredChecks.filter(c => c.app_name.toLowerCase().includes(filterApp.toLowerCase()));
    }
    
    const headers = 'Server,Application,Type,Status,Response Time,Checked At\n';
    const rows = filteredChecks.map(c => 
      `${c.server_name},${c.app_name},${c.check_type},${c.status},${c.response_time},${new Date(c.checked_at).toLocaleString()}`
    ).join('\n');
    
    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusColor = (status) => {
    if (status === 'up') return 'text-emerald-400 bg-emerald-900/20 border-emerald-500/40';
    if (status === 'down') return 'text-rose-400 bg-rose-900/20 border-rose-500/40';
    return 'text-slate-400 bg-slate-800/20 border-slate-600/40';
  };

  const getServerStatus = (serverId) => {
    if (!dashboard) return { portUp: 0, portDown: 0, healthUp: 0, healthDown: 0, slowResponses: 0, thresholdViolations: 0 };
    const serverChecks = dashboard.recentChecks.filter(c => {
      const server = servers.find(s => s.name === c.server_name);
      return server && server.id === serverId;
    });
    const latestChecks = {};
    serverChecks.forEach(check => {
      const key = `${check.application_id}-${check.check_type}`;
      if (!latestChecks[key] || new Date(check.checked_at) > new Date(latestChecks[key].checked_at)) {
        latestChecks[key] = check;
      }
    });
    const stats = { portUp: 0, portDown: 0, healthUp: 0, healthDown: 0, slowResponses: 0, thresholdViolations: 0 };
    Object.values(latestChecks).forEach(check => {
      if (check.check_type === 'port') {
        if (check.status === 'up') stats.portUp++;
        else stats.portDown++;
      } else if (check.check_type === 'health') {
        if (check.status === 'up') stats.healthUp++;
        else stats.healthDown++;
      }
      if (check.response_time > 4000) stats.slowResponses++;
      if (check.response_time > 4000) stats.thresholdViolations++;
    });
    return stats;
  };

  const getOverallStats = () => {
    if (!dashboard) return { portUp: 0, portDown: 0, healthUp: 0, healthDown: 0, slowResponses: 0, thresholdViolations: 0 };
    const latestChecks = {};
    dashboard.recentChecks.forEach(check => {
      const key = `${check.application_id}-${check.check_type}`;
      if (!latestChecks[key] || new Date(check.checked_at) > new Date(latestChecks[key].checked_at)) {
        latestChecks[key] = check;
      }
    });
    const stats = { portUp: 0, portDown: 0, healthUp: 0, healthDown: 0, slowResponses: 0, thresholdViolations: 0 };
    Object.values(latestChecks).forEach(check => {
      if (check.check_type === 'port') {
        if (check.status === 'up') stats.portUp++;
        else stats.portDown++;
      } else if (check.check_type === 'health') {
        if (check.status === 'up') stats.healthUp++;
        else stats.healthDown++;
      }
      if (check.response_time > 4000) stats.slowResponses++;
      if (check.response_time > 4000) stats.thresholdViolations++;
    });
    return stats;
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/80 border border-emerald-500/20 rounded-2xl p-10 backdrop-blur-xl">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-500/30 mb-6">
                <span className="text-emerald-400 text-4xl">◈</span>
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2">CXHUB-Monitor</h1>
              <p className="text-xs text-emerald-600/80 font-medium tracking-widest">SECURITY OPERATIONS CENTER</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-emerald-500/80 mb-2">USERNAME</label>
                <input
                  type="text"
                  required
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-emerald-500/80 mb-2">PASSWORD</label>
                <input
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 px-6 py-4 rounded-xl font-semibold border border-emerald-500/30 hover:from-emerald-500/30 hover:to-teal-500/30 transition-all"
              >
                ACCESS SYSTEM
              </button>
              
              <p className="text-xs text-emerald-700/60 text-center mt-4">First login creates admin account</p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const stats = getOverallStats();
  const totalOffline = stats.portDown + stats.healthDown;
  const totalAlerts = totalOffline + stats.thresholdViolations;
  const sortedServers = [...servers].sort((a, b) => {
    const aStats = getServerStatus(a.id);
    const bStats = getServerStatus(b.id);
    const aIssues = aStats.portDown + aStats.healthDown + aStats.thresholdViolations;
    const bIssues = bStats.portDown + bStats.healthDown + bStats.thresholdViolations;
    return bIssues - aIssues;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-emerald-400">
      
      <nav className="bg-slate-900/80 border-b border-emerald-500/10 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-emerald-400 text-2xl">◈</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">CXHUB-Monitor</h1>
                  <p className="text-[9px] text-emerald-600/60 font-medium">SEC_OPS_v2.0</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setView('dashboard')} className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${view === 'dashboard' ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30' : 'text-emerald-600/70 hover:text-emerald-400 hover:bg-emerald-500/5'}`}>
                  LIVE
                </button>
                <button onClick={() => setView('history')} className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${view === 'history' ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30' : 'text-emerald-600/70 hover:text-emerald-400 hover:bg-emerald-500/5'}`}>
                  HISTORY
                </button>
                <button onClick={() => setView('servers')} className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${view === 'servers' || view === 'serverDetail' ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30' : 'text-emerald-600/70 hover:text-emerald-400 hover:bg-emerald-500/5'}`}>
                  SERVERS
                </button>
                {user?.role === 'admin' && (
                  <button onClick={() => setView('users')} className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${view === 'users' ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30' : 'text-emerald-600/70 hover:text-emerald-400 hover:bg-emerald-500/5'}`}>
                    USERS
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-[10px] font-semibold bg-slate-900/60 px-3 py-2 rounded-lg border border-emerald-500/20">
                <span className="text-emerald-600/70">{user?.username.toUpperCase()}</span>
                <span className="text-emerald-500/50 mx-1">|</span>
                <span className="text-emerald-500">{user?.role.toUpperCase()}</span>
              </div>
              <button onClick={handleLogout} className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg hover:bg-rose-500/20 transition-all">
                LOGOUT
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {view === 'dashboard' && dashboard && (
          <div className="space-y-5">
            <div className="grid grid-cols-6 gap-4">
              <div className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border border-emerald-500/20">
                <div className="text-[10px] font-bold text-emerald-600/70 mb-2">SERVERS</div>
                <div className="text-4xl font-bold text-emerald-400">{String(dashboard.summary.total_servers).padStart(2,'0')}</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border border-emerald-500/20">
                <div className="text-[10px] font-bold text-emerald-600/70 mb-2">APPLICATIONS</div>
                <div className="text-4xl font-bold text-emerald-400">{String(dashboard.summary.total_applications).padStart(2,'0')}</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border border-emerald-500/40">
                <div className="text-[10px] font-bold text-emerald-600/70 mb-2">PORT UP</div>
                <div className="text-4xl font-bold text-emerald-400">{String(stats.portUp).padStart(2,'0')}</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border border-teal-500/40">
                <div className="text-[10px] font-bold text-teal-600/70 mb-2">HEALTH UP</div>
                <div className="text-4xl font-bold text-teal-400">{String(stats.healthUp).padStart(2,'0')}</div>
              </div>
              <div className={`bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border ${stats.slowResponses > 0 ? 'border-amber-500/40' : 'border-amber-500/20'}`}>
                <div className="text-[10px] font-bold text-amber-600/70 mb-2">SLOW</div>
                <div className={`text-4xl font-bold ${stats.slowResponses > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{String(stats.slowResponses).padStart(2,'0')}</div>
              </div>
              <div className={`bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border ${totalAlerts > 0 && blink ? 'border-rose-500/50' : 'border-rose-500/20'}`}>
                <div className="text-[10px] font-bold text-rose-600/70 mb-2">ALERTS</div>
                <div className={`text-4xl font-bold ${totalAlerts > 0 ? 'text-rose-400' : 'text-slate-600'}`}>{String(totalAlerts).padStart(2,'0')}</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 rounded-2xl border border-emerald-500/20">
              <div className="px-6 py-4 border-b border-emerald-500/10">
                <h2 className="text-sm font-bold text-emerald-400">NETWORK STATUS</h2>
              </div>
              <div className="p-5 space-y-3">
                {sortedServers.map(server => {
                  const serverStats = getServerStatus(server.id);
                  const isOffline = serverStats.portDown > 0 || serverStats.healthDown > 0;
                  return (
                    <div key={server.id} onClick={() => loadServerDetails(server.id)} className={`p-4 rounded-xl border cursor-pointer transition-all ${isOffline ? 'bg-rose-900/10 border-rose-500/30' : 'bg-emerald-900/5 border-emerald-500/20'}`}>
                      <div className="flex items-center">
                        <div className="w-48">
                          <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${isOffline ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                            <div>
                              <div className="text-sm font-bold text-emerald-300">{server.name}</div>
                              <div className="text-xs text-emerald-700">{server.host}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 grid grid-cols-4 gap-4 text-center text-sm">
                          <div>
                            <div className="text-xs text-emerald-600 mb-1">PORT</div>
                            <div className="font-bold text-emerald-300">{serverStats.portUp}{serverStats.portDown > 0 && <span className="text-rose-400">/{serverStats.portDown}</span>}</div>
                          </div>
                          <div>
                            <div className="text-xs text-teal-600 mb-1">HEALTH</div>
                            <div className="font-bold text-teal-300">{serverStats.healthUp}{serverStats.healthDown > 0 && <span className="text-rose-400">/{serverStats.healthDown}</span>}</div>
                          </div>
                          <div>
                            <div className="text-xs text-amber-600 mb-1">SLOW</div>
                            <div className={`font-bold ${serverStats.slowResponses > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{serverStats.slowResponses}</div>
                          </div>
                          <div>
                            <div className="text-xs text-emerald-600 mb-1">APPS</div>
                            <div className="font-bold text-emerald-500">{server.app_count}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {view === 'history' && history && (
          <div className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 rounded-2xl border border-emerald-500/20">
            <div className="px-6 py-4 border-b border-emerald-500/10 flex justify-between items-center">
              <h2 className="text-sm font-bold text-emerald-400">HISTORY (30 DAYS)</h2>
              <div className="flex items-center space-x-3">
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="px-3 py-2 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="custom">Custom</option>
                </select>
                {dateRange === 'custom' && (
                  <>
                    <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="px-3 py-2 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm" />
                    <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="px-3 py-2 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm" />
                  </>
                )}
                <input type="text" placeholder="Filter..." value={filterApp} onChange={(e) => setFilterApp(e.target.value)} className="px-4 py-2 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm" />
                <button onClick={downloadHistoryCSV} className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-500/30">EXPORT</button>
              </div>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/40 border-b border-emerald-500/10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">SERVER</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">APP</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">TYPE</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">STATUS</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">RESP</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">TIME</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-500/5">
                {history.recentChecks.filter(c => !filterApp || c.app_name.toLowerCase().includes(filterApp.toLowerCase())).map(check => (
                  <tr key={check.id} className="hover:bg-emerald-900/5">
                    <td className="px-6 py-3 text-emerald-400">{check.server_name}</td>
                    <td className="px-6 py-3 text-emerald-400">{check.app_name}</td>
                    <td className="px-6 py-3 text-emerald-600">{check.check_type}</td>
                    <td className="px-6 py-3"><span className={`px-3 py-1 text-xs font-bold rounded-lg border ${getStatusColor(check.status)}`}>{check.status.toUpperCase()}</span></td>
                    <td className={`px-6 py-3 ${check.response_time > 4000 ? 'text-amber-400' : 'text-emerald-600'}`}>{check.response_time}ms</td>
                    <td className="px-6 py-3 text-emerald-600">{new Date(check.checked_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'servers' && (
          <div>
            <div className="flex justify-between mb-5">
              <h2 className="text-lg font-bold text-emerald-400">SERVERS</h2>
              <div className="flex gap-2">
                <button onClick={downloadExistingServers} className="bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-teal-300 px-4 py-2 rounded-xl text-sm font-semibold border border-teal-500/30">DOWNLOAD</button>
                <button onClick={downloadTemplate} className="bg-slate-900/60 text-emerald-400 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-500/20">TEMPLATE</button>
                <label className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-500/30 cursor-pointer">UPLOAD ADD<input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'add')} className="hidden" /></label>
                <label className="bg-gradient-to-r from-rose-500/20 to-red-500/20 text-rose-300 px-4 py-2 rounded-xl text-sm font-semibold border border-rose-500/30 cursor-pointer">UPLOAD DEL<input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'delete')} className="hidden" /></label>
                {hasPermission('servers','w') && <button onClick={() => openModal('server', {})} className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-500/30">ADD</button>}
              </div>
            </div>
            {uploadProgress && <div className="mb-4 p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{uploadProgress}</div>}
            <div className="grid grid-cols-3 gap-4">
              {servers.map(server => (
                <div key={server.id} className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border border-emerald-500/20">
                  <div className="flex justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-emerald-300">{server.name}</h3>
                      <p className="text-sm text-emerald-700">{server.host}</p>
                    </div>
                    <div className="flex space-x-2">
                      {hasPermission('servers','w') && <button onClick={() => openModal('server', server)} className="text-emerald-400 text-xs">EDIT</button>}
                      {hasPermission('servers','d') && <button onClick={() => handleDelete('server', server.id)} className="text-rose-400 text-xs">DEL</button>}
                    </div>
                  </div>
                  <div className="text-sm text-emerald-500 mb-4 bg-emerald-900/20 px-3 py-1.5 rounded-lg inline-block">{server.app_count} APPS</div>
                  <button onClick={() => loadServerDetails(server.id)} className="w-full bg-gradient-to-r from-slate-900/60 to-slate-800/60 text-emerald-400 px-4 py-3 rounded-xl text-sm font-semibold border border-emerald-500/20">DETAILS</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'serverDetail' && selectedServer && (
          <div>
            <button onClick={() => setView('servers')} className="text-emerald-400 mb-4 text-sm">← BACK</button>
            <div className="flex justify-between mb-5">
              <div>
                <h2 className="text-2xl font-bold text-emerald-400">{selectedServer.name.toUpperCase()}</h2>
                <p className="text-emerald-600">{selectedServer.host}</p>
              </div>
              {hasPermission('servers','w') && <button onClick={() => openModal('application', { server_id: selectedServer.id })} className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 px-5 py-3 rounded-xl text-sm font-semibold border border-emerald-500/30">ADD APP</button>}
            </div>
            <div className="space-y-3">
              {selectedServer.applications && selectedServer.applications.map(app => (
                <div key={app.id} className="bg-gradient-to-r from-slate-900/60 to-slate-900/40 p-5 rounded-2xl border border-emerald-500/20">
                  <div className="flex justify-between mb-3">
                    <div>
                      <h3 className="text-base font-bold text-emerald-300">{app.name}</h3>
                      <div className="space-y-1 text-sm text-emerald-600 mt-2">
                        {app.port && <div>PORT: {app.port}</div>}
                        {app.health_url && <div>HEALTH: {app.health_url}</div>}
                        <div>INTERVAL: {app.check_interval}s | THRESHOLD: {app.response_threshold || 4000}ms</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {app.last_status && <span className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${getStatusColor(app.last_status)}`}>{app.last_status.toUpperCase()}</span>}
                      <button onClick={() => manualCheck(app.id)} className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/30">CHECK</button>
                      {hasPermission('servers','w') && <button onClick={() => openModal('application', { ...app, server_id: selectedServer.id })} className="text-emerald-400 text-xs">EDIT</button>}
                      {hasPermission('servers','d') && <button onClick={() => handleDelete('application', app.id)} className="text-rose-400 text-xs">DEL</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'users' && user?.role === 'admin' && (
          <div>
            <div className="flex justify-between mb-5">
              <h2 className="text-lg font-bold text-emerald-400">USER MANAGEMENT</h2>
              <button onClick={() => openModal('user', {})} className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 px-5 py-3 rounded-xl text-sm font-semibold border border-emerald-500/30">ADD USER</button>
            </div>
            <div className="bg-gradient-to-br from-slate-900/60 to-slate-900/40 rounded-2xl border border-emerald-500/20">
              <table className="min-w-full">
                <thead className="bg-slate-900/40 border-b border-emerald-500/10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">USERNAME</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">ROLE</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">PERMISSIONS</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-emerald-500/70">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-500/5">
                  {JSON.parse(localStorage.getItem('ozone_users') || '[]').map((u, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-3 text-sm text-emerald-400">{u.username}</td>
                      <td className="px-6 py-3"><span className={`px-3 py-1 text-xs font-bold rounded-lg border ${u.role === 'admin' ? 'text-rose-400 bg-rose-900/20 border-rose-500/40' : 'text-emerald-400 bg-emerald-900/20 border-emerald-500/40'}`}>{u.role.toUpperCase()}</span></td>
                      <td className="px-6 py-3 text-sm text-emerald-600">D:{u.permissions?.dashboard} H:{u.permissions?.history} S:{u.permissions?.servers}</td>
                      <td className="px-6 py-3">{u.role !== 'admin' && <button onClick={() => { const users = JSON.parse(localStorage.getItem('ozone_users') || '[]'); localStorage.setItem('ozone_users', JSON.stringify(users.filter(user => user.username !== u.username))); setView('users'); }} className="text-rose-400 text-xs">DELETE</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showModal && modalType === 'user' && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl max-w-md w-full p-8">
            <h3 className="text-lg font-bold text-emerald-400 mb-6">ADD USER</h3>
            <form onSubmit={(e) => { e.preventDefault(); const users = JSON.parse(localStorage.getItem('ozone_users') || '[]'); users.push({ username: formData.username, password: formData.password, role: 'user', permissions: { dashboard: formData.dashboardPerm || 'r', history: formData.historyPerm || 'r', servers: formData.serversPerm || 'r' } }); localStorage.setItem('ozone_users', JSON.stringify(users)); setShowModal(false); setFormData({}); alert('User created'); }} className="space-y-5">
              <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">USERNAME</label><input type="text" required value={formData.username || ''} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
              <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">PASSWORD</label><input type="password" required value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
              <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">DASHBOARD (r/rw)</label><input type="text" value={formData.dashboardPerm || 'r'} onChange={(e) => setFormData({ ...formData, dashboardPerm: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
              <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">HISTORY (r/rw)</label><input type="text" value={formData.historyPerm || 'r'} onChange={(e) => setFormData({ ...formData, historyPerm: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
              <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">SERVERS (r/rw/rwd)</label><input type="text" value={formData.serversPerm || 'r'} onChange={(e) => setFormData({ ...formData, serversPerm: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
              <div className="flex justify-end space-x-3"><button type="button" onClick={() => { setShowModal(false); setFormData({}); }} className="px-6 py-3 text-emerald-600 bg-slate-900/60 rounded-xl">CANCEL</button><button type="submit" className="px-6 py-3 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 rounded-xl border border-emerald-500/30">CREATE</button></div>
            </form>
          </div>
        </div>
      )}

      {showModal && modalType !== 'user' && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl max-w-md w-full p-8">
            <h3 className="text-lg font-bold text-emerald-400 mb-6">{formData.id ? 'EDIT' : 'ADD'} {modalType === 'server' ? 'SERVER' : 'APP'}</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              {modalType === 'server' ? (
                <>
                  <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">SERVER NAME</label><input type="text" required value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
                  <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">HOST/IP</label><input type="text" required value={formData.host || ''} onChange={(e) => setFormData({ ...formData, host: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
                </>
              ) : (
                <>
                  <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">APP NAME</label><input type="text" required value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
                  <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">PORT</label><input type="number" value={formData.port || ''} onChange={(e) => setFormData({ ...formData, port: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
                  <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">HEALTH URL</label><input type="text" value={formData.health_url || ''} onChange={(e) => setFormData({ ...formData, health_url: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
                  <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">INTERVAL (s)</label><input type="number" value={formData.check_interval || 60} onChange={(e) => setFormData({ ...formData, check_interval: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
                  <div><label className="block text-xs font-semibold text-emerald-500/80 mb-2">THRESHOLD (ms)</label><input type="number" value={formData.response_threshold || 4000} onChange={(e) => setFormData({ ...formData, response_threshold: e.target.value })} className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-500/20 rounded-xl text-emerald-400" /></div>
                </>
              )}
              <div className="flex justify-end space-x-3"><button type="button" onClick={() => { setShowModal(false); setFormData({}); }} className="px-6 py-3 text-emerald-600 bg-slate-900/60 rounded-xl">CANCEL</button><button type="submit" className="px-6 py-3 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 rounded-xl border border-emerald-500/30">{formData.id ? 'UPDATE' : 'CREATE'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

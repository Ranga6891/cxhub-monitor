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

  const handleLogin = async (e) => {
    e.preventDefault();
    const users = JSON.parse(localStorage.getItem('ozone_users') || '[]');

    if (users.length === 0) {
      const adminUser = {
        username: loginForm.username,
        password: loginForm.password,
        role: 'admin',
        permissions: { dashboard: 'rw', history: 'rw', servers: 'rwd', scripts: 'rwd' }
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
    if (status === 'up') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/50';
    if (status === 'down') return 'text-red-500 bg-red-500/20 border-red-500/70';
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
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-cyan-500/30 rounded-3xl p-10 backdrop-blur-xl shadow-2xl shadow-cyan-500/10">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/40 mb-6 shadow-lg shadow-cyan-500/20">
                <span className="text-cyan-400 text-5xl font-bold">⬡</span>
              </div>
              <h1 className="text-5xl font-black bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent mb-3 tracking-tight">CXHUB</h1>
              <p className="text-xs text-cyan-400/60 font-bold tracking-[0.3em] uppercase">Security Operations Center</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-cyan-400/80 mb-3 tracking-wider">USERNAME</label>
                <input
                  type="text"
                  required
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                  className="w-full px-5 py-4 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium focus:outline-none focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                  placeholder="Enter username"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-cyan-400/80 mb-3 tracking-wider">PASSWORD</label>
                <input
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                  className="w-full px-5 py-4 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium focus:outline-none focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                  placeholder="Enter password"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-white px-6 py-4 rounded-xl font-bold border border-cyan-400/50 hover:from-cyan-500/40 hover:to-blue-500/40 hover:border-cyan-400/70 transition-all shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 tracking-wide"
              >
                ACCESS SYSTEM
              </button>

              <p className="text-xs text-cyan-600/50 text-center mt-5 font-medium">First login creates admin account</p>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-cyan-100">

      <nav className="bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-900/95 border-b border-cyan-500/20 backdrop-blur-xl shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-10">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-400/50 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <span className="text-cyan-300 text-3xl font-bold">⬡</span>
                </div>
                <div>
                  <h1 className="text-2xl font-black bg-gradient-to-r from-cyan-300 via-blue-300 to-cyan-200 bg-clip-text text-transparent tracking-tight">CXHUB</h1>
                  <p className="text-[10px] text-cyan-500/60 font-bold tracking-widest">MONITOR v2.0</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setView('dashboard')} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${view === 'dashboard' ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 border border-cyan-400/50 shadow-lg shadow-cyan-500/20' : 'text-cyan-600/80 hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent'}`}>
                  LIVE DASHBOARD
                </button>
                <button onClick={() => setView('history')} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${view === 'history' ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 border border-cyan-400/50 shadow-lg shadow-cyan-500/20' : 'text-cyan-600/80 hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent'}`}>
                  HISTORY
                </button>
                <button onClick={() => setView('servers')} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${view === 'servers' || view === 'serverDetail' ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 border border-cyan-400/50 shadow-lg shadow-cyan-500/20' : 'text-cyan-600/80 hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent'}`}>
                  SERVERS
                </button>
                <button onClick={() => setView('scripts')} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${view === 'scripts' ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 border border-cyan-400/50 shadow-lg shadow-cyan-500/20' : 'text-cyan-600/80 hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent'}`}>
                  SCRIPTS
                </button>
                {user?.role === 'admin' && (
                  <button onClick={() => setView('users')} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${view === 'users' ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 border border-cyan-400/50 shadow-lg shadow-cyan-500/20' : 'text-cyan-600/80 hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent'}`}>
                    USERS
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-xs font-bold bg-slate-900/70 px-4 py-2.5 rounded-xl border border-cyan-500/30 shadow-inner">
                <span className="text-cyan-400">{user?.username.toUpperCase()}</span>
                <span className="text-cyan-600/50 mx-2">|</span>
                <span className="text-cyan-300">{user?.role.toUpperCase()}</span>
              </div>
              <button onClick={handleLogout} className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-2.5 rounded-xl hover:bg-red-500/20 hover:border-red-500/50 transition-all">
                LOGOUT
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {view === 'dashboard' && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-6 gap-5">
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border border-cyan-500/30 shadow-lg">
                <div className="text-xs font-bold text-cyan-500/70 mb-3 tracking-wider">SERVERS</div>
                <div className="text-5xl font-black text-cyan-300 font-mono">{String(dashboard.summary.total_servers).padStart(2,'0')}</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border border-cyan-500/30 shadow-lg">
                <div className="text-xs font-bold text-cyan-500/70 mb-3 tracking-wider">APPS</div>
                <div className="text-5xl font-black text-cyan-300 font-mono">{String(dashboard.summary.total_applications).padStart(2,'0')}</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border border-emerald-500/50 shadow-lg shadow-emerald-500/10">
                <div className="text-xs font-bold text-emerald-400/70 mb-3 tracking-wider">PORT UP</div>
                <div className="text-5xl font-black text-emerald-400 font-mono">{String(stats.portUp).padStart(2,'0')}</div>
              </div>
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border border-teal-500/50 shadow-lg shadow-teal-500/10">
                <div className="text-xs font-bold text-teal-400/70 mb-3 tracking-wider">HEALTH UP</div>
                <div className="text-5xl font-black text-teal-400 font-mono">{String(stats.healthUp).padStart(2,'0')}</div>
              </div>
              <div className={`bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border shadow-lg ${stats.slowResponses > 0 ? 'border-amber-500/60 shadow-amber-500/20' : 'border-amber-500/30'}`}>
                <div className="text-xs font-bold text-amber-400/70 mb-3 tracking-wider">SLOW</div>
                <div className={`text-5xl font-black font-mono ${stats.slowResponses > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{String(stats.slowResponses).padStart(2,'0')}</div>
              </div>
              <div className={`bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border shadow-xl transition-all ${totalAlerts > 0 ? 'pulse-red-alert bg-red-500/5' : 'border-red-500/30'}`}>
                <div className="text-xs font-bold text-red-400/70 mb-3 tracking-wider">ALERTS</div>
                <div className={`text-5xl font-black font-mono ${totalAlerts > 0 ? 'text-red-500 glow-red-text' : 'text-slate-600'}`}>{String(totalAlerts).padStart(2,'0')}</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 rounded-2xl border border-cyan-500/30 shadow-xl">
              <div className="px-6 py-5 border-b border-cyan-500/20">
                <h2 className="text-lg font-black text-cyan-300 tracking-wide">NETWORK STATUS</h2>
              </div>
              <div className="p-6 space-y-4">
                {sortedServers.map(server => {
                  const serverStats = getServerStatus(server.id);
                  const isOffline = serverStats.portDown > 0 || serverStats.healthDown > 0;
                  return (
                    <div key={server.id} onClick={() => loadServerDetails(server.id)} className={`p-5 rounded-xl border cursor-pointer transition-all shadow-lg ${isOffline ? 'bg-red-500/10 border-red-500/60 pulse-red-alert' : 'bg-cyan-500/5 border-cyan-500/30 hover:border-cyan-400/50 hover:bg-cyan-500/10'}`}>
                      <div className="flex items-center">
                        <div className="w-64">
                          <div className="flex items-center space-x-3">
                            <div className={`w-4 h-4 rounded-full shadow-lg ${isOffline ? 'bg-red-500 shadow-red-500/50 glow-red-text' : 'bg-emerald-500 shadow-emerald-500/50'}`}></div>
                            <div>
                              <div className={`text-base font-bold ${isOffline ? 'text-red-400' : 'text-cyan-200'}`}>{server.name}</div>
                              <div className="text-xs text-cyan-600 font-mono">{server.host}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 grid grid-cols-4 gap-6 text-center text-sm">
                          <div>
                            <div className="text-xs text-cyan-500/70 mb-2 font-bold tracking-wider">PORT</div>
                            <div className="font-black text-cyan-200 text-lg font-mono">{serverStats.portUp}{serverStats.portDown > 0 && <span className="text-red-500">/{serverStats.portDown}</span>}</div>
                          </div>
                          <div>
                            <div className="text-xs text-teal-500/70 mb-2 font-bold tracking-wider">HEALTH</div>
                            <div className="font-black text-teal-200 text-lg font-mono">{serverStats.healthUp}{serverStats.healthDown > 0 && <span className="text-red-500">/{serverStats.healthDown}</span>}</div>
                          </div>
                          <div>
                            <div className="text-xs text-amber-500/70 mb-2 font-bold tracking-wider">SLOW</div>
                            <div className={`font-black text-lg font-mono ${serverStats.slowResponses > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{serverStats.slowResponses}</div>
                          </div>
                          <div>
                            <div className="text-xs text-cyan-500/70 mb-2 font-bold tracking-wider">APPS</div>
                            <div className="font-black text-cyan-400 text-lg font-mono">{server.app_count}</div>
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
          <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 rounded-2xl border border-cyan-500/30 shadow-xl">
            <div className="px-6 py-5 border-b border-cyan-500/20 flex justify-between items-center">
              <h2 className="text-lg font-black text-cyan-300 tracking-wide">CHECK HISTORY</h2>
              <div className="flex items-center space-x-3">
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="px-4 py-2.5 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-200 text-sm font-semibold focus:border-cyan-400/50">
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="custom">Custom</option>
                </select>
                {dateRange === 'custom' && (
                  <>
                    <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="px-4 py-2.5 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-200 text-sm font-semibold" />
                    <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="px-4 py-2.5 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-200 text-sm font-semibold" />
                  </>
                )}
                <input type="text" placeholder="Filter application..." value={filterApp} onChange={(e) => setFilterApp(e.target.value)} className="px-5 py-2.5 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-200 text-sm font-semibold placeholder-cyan-700" />
                <button onClick={downloadHistoryCSV} className="bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 px-5 py-2.5 rounded-xl text-sm font-bold border border-cyan-400/50 hover:from-cyan-500/40 hover:to-blue-500/40">EXPORT CSV</button>
              </div>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60 border-b border-cyan-500/20">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">SERVER</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">APPLICATION</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">TYPE</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">STATUS</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">RESPONSE</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">TIMESTAMP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/10">
                {history.recentChecks.filter(c => !filterApp || c.app_name.toLowerCase().includes(filterApp.toLowerCase())).map(check => (
                  <tr key={check.id} className="hover:bg-cyan-500/5 transition-colors">
                    <td className="px-6 py-4 text-cyan-200 font-semibold">{check.server_name}</td>
                    <td className="px-6 py-4 text-cyan-200 font-semibold">{check.app_name}</td>
                    <td className="px-6 py-4 text-cyan-500 font-mono text-xs">{check.check_type.toUpperCase()}</td>
                    <td className="px-6 py-4"><span className={`px-4 py-1.5 text-xs font-black rounded-lg border ${getStatusColor(check.status)}`}>{check.status.toUpperCase()}</span></td>
                    <td className={`px-6 py-4 font-mono font-bold ${check.response_time > 4000 ? 'text-amber-400' : 'text-cyan-500'}`}>{check.response_time}ms</td>
                    <td className="px-6 py-4 text-cyan-600 text-xs font-mono">{new Date(check.checked_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'servers' && (
          <div>
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-black text-cyan-300 tracking-wide">SERVER MANAGEMENT</h2>
              <div className="flex gap-3">
                <button onClick={downloadExistingServers} className="bg-gradient-to-r from-teal-500/30 to-cyan-500/30 text-teal-200 px-5 py-3 rounded-xl text-sm font-bold border border-teal-400/50 hover:from-teal-500/40 hover:to-cyan-500/40">DOWNLOAD</button>
                <button onClick={downloadTemplate} className="bg-slate-900/70 text-cyan-300 px-5 py-3 rounded-xl text-sm font-bold border border-cyan-500/30 hover:bg-slate-900/90">TEMPLATE</button>
                <label className="bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 px-5 py-3 rounded-xl text-sm font-bold border border-cyan-400/50 cursor-pointer hover:from-cyan-500/40 hover:to-blue-500/40">UPLOAD ADD<input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'add')} className="hidden" /></label>
                <label className="bg-gradient-to-r from-red-500/30 to-rose-500/30 text-red-300 px-5 py-3 rounded-xl text-sm font-bold border border-red-500/50 cursor-pointer hover:from-red-500/40 hover:to-rose-500/40">UPLOAD DEL<input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'delete')} className="hidden" /></label>
                {hasPermission('servers','w') && <button onClick={() => openModal('server', {})} className="bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 px-5 py-3 rounded-xl text-sm font-bold border border-cyan-400/50 hover:from-cyan-500/40 hover:to-blue-500/40">ADD SERVER</button>}
              </div>
            </div>
            {uploadProgress && <div className="mb-5 p-5 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/40 rounded-xl text-cyan-300 text-sm font-semibold shadow-lg">{uploadProgress}</div>}
            <div className="grid grid-cols-3 gap-5">
              {servers.map(server => (
                <div key={server.id} className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border border-cyan-500/30 shadow-lg hover:border-cyan-400/50 transition-all">
                  <div className="flex justify-between mb-5">
                    <div>
                      <h3 className="text-lg font-bold text-cyan-200">{server.name}</h3>
                      <p className="text-sm text-cyan-600 font-mono">{server.host}</p>
                    </div>
                    <div className="flex space-x-3">
                      {hasPermission('servers','w') && <button onClick={() => openModal('server', server)} className="text-cyan-400 text-xs font-bold hover:text-cyan-300">EDIT</button>}
                      {hasPermission('servers','d') && <button onClick={() => handleDelete('server', server.id)} className="text-red-400 text-xs font-bold hover:text-red-300">DELETE</button>}
                    </div>
                  </div>
                  <div className="text-sm text-cyan-300 mb-5 bg-cyan-500/10 px-4 py-2 rounded-lg inline-block font-bold border border-cyan-500/30">{server.app_count} APPLICATIONS</div>
                  <button onClick={() => loadServerDetails(server.id)} className="w-full bg-gradient-to-r from-slate-900/80 to-slate-800/80 text-cyan-300 px-4 py-3 rounded-xl text-sm font-bold border border-cyan-500/40 hover:border-cyan-400/60 hover:bg-slate-900">VIEW DETAILS</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'serverDetail' && selectedServer && (
          <div>
            <button onClick={() => setView('servers')} className="text-cyan-400 mb-5 text-sm font-bold hover:text-cyan-300">← BACK TO SERVERS</button>
            <div className="flex justify-between mb-6">
              <div>
                <h2 className="text-3xl font-black text-cyan-300 tracking-tight">{selectedServer.name.toUpperCase()}</h2>
                <p className="text-cyan-500 font-mono text-lg">{selectedServer.host}</p>
              </div>
              {hasPermission('servers','w') && <button onClick={() => openModal('application', { server_id: selectedServer.id })} className="bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 px-6 py-4 rounded-xl text-sm font-bold border border-cyan-400/50 hover:from-cyan-500/40 hover:to-blue-500/40 shadow-lg">ADD APPLICATION</button>}
            </div>
            <div className="space-y-4">
              {selectedServer.applications && selectedServer.applications.map(app => (
                <div key={app.id} className="bg-gradient-to-r from-slate-900/80 to-slate-950/80 p-6 rounded-2xl border border-cyan-500/30 shadow-lg hover:border-cyan-400/50 transition-all">
                  <div className="flex justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-cyan-200 mb-3">{app.name}</h3>
                      <div className="space-y-2 text-sm text-cyan-500 font-mono">
                        {app.port && <div className="flex items-center space-x-2"><span className="text-cyan-600">PORT:</span><span className="text-cyan-300 font-bold">{app.port}</span></div>}
                        {app.health_url && <div className="flex items-center space-x-2"><span className="text-cyan-600">HEALTH:</span><span className="text-cyan-400 text-xs">{app.health_url}</span></div>}
                        <div className="flex items-center space-x-2"><span className="text-cyan-600">INTERVAL:</span><span className="text-cyan-300 font-bold">{app.check_interval}s</span><span className="text-cyan-600 mx-2">|</span><span className="text-cyan-600">THRESHOLD:</span><span className="text-cyan-300 font-bold">{app.response_threshold || 4000}ms</span></div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {app.last_status && <span className={`px-5 py-2 text-sm font-black rounded-xl border ${getStatusColor(app.last_status)} shadow-lg`}>{app.last_status.toUpperCase()}</span>}
                      <button onClick={() => manualCheck(app.id)} className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 px-4 py-2 rounded-xl text-xs font-bold border border-cyan-400/40 hover:from-cyan-500/30 hover:to-blue-500/30">CHECK NOW</button>
                      {hasPermission('servers','w') && <button onClick={() => openModal('application', { ...app, server_id: selectedServer.id })} className="text-cyan-400 text-xs font-bold hover:text-cyan-300">EDIT</button>}
                      {hasPermission('servers','d') && <button onClick={() => handleDelete('application', app.id)} className="text-red-400 text-xs font-bold hover:text-red-300">DELETE</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'scripts' && (
          <div>
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-black text-cyan-300 tracking-wide">CUSTOM SCRIPT EXECUTION</h2>
            </div>
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 rounded-2xl border border-cyan-500/30 shadow-xl p-8">
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/40 mb-6">
                  <span className="text-cyan-400 text-4xl">⚡</span>
                </div>
                <h3 className="text-2xl font-bold text-cyan-300 mb-4">Script Execution Module</h3>
                <p className="text-cyan-500 mb-8 max-w-2xl mx-auto">Execute custom scripts on monitored servers. This feature allows you to run maintenance tasks, gather diagnostics, or perform automated operations across your infrastructure.</p>
                <div className="space-y-4 max-w-2xl mx-auto text-left">
                  <div className="bg-slate-900/60 p-5 rounded-xl border border-cyan-500/30">
                    <h4 className="text-sm font-bold text-cyan-400 mb-2 tracking-wider">COMING SOON</h4>
                    <ul className="text-sm text-cyan-300 space-y-2 font-medium">
                      <li className="flex items-start space-x-2"><span className="text-cyan-500">•</span><span>Remote script execution on selected servers</span></li>
                      <li className="flex items-start space-x-2"><span className="text-cyan-500">•</span><span>Pre-defined script templates for common tasks</span></li>
                      <li className="flex items-start space-x-2"><span className="text-cyan-500">•</span><span>Real-time execution logs and output capture</span></li>
                      <li className="flex items-start space-x-2"><span className="text-cyan-500">•</span><span>Scheduled script execution with cron-like scheduling</span></li>
                      <li className="flex items-start space-x-2"><span className="text-cyan-500">•</span><span>Execution history and audit trail</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'users' && user?.role === 'admin' && (
          <div>
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-black text-cyan-300 tracking-wide">USER MANAGEMENT</h2>
              <button onClick={() => openModal('user', {})} className="bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 px-6 py-4 rounded-xl text-sm font-bold border border-cyan-400/50 hover:from-cyan-500/40 hover:to-blue-500/40 shadow-lg">ADD USER</button>
            </div>
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 rounded-2xl border border-cyan-500/30 shadow-xl">
              <table className="min-w-full">
                <thead className="bg-slate-900/60 border-b border-cyan-500/20">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">USERNAME</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">ROLE</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">PERMISSIONS</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-cyan-400/80 tracking-wider">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/10">
                  {JSON.parse(localStorage.getItem('ozone_users') || '[]').map((u, idx) => (
                    <tr key={idx} className="hover:bg-cyan-500/5">
                      <td className="px-6 py-4 text-sm text-cyan-200 font-bold">{u.username}</td>
                      <td className="px-6 py-4"><span className={`px-4 py-1.5 text-xs font-black rounded-lg border ${u.role === 'admin' ? 'text-red-400 bg-red-500/10 border-red-500/50' : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/50'}`}>{u.role.toUpperCase()}</span></td>
                      <td className="px-6 py-4 text-sm text-cyan-500 font-mono">D:{u.permissions?.dashboard} H:{u.permissions?.history} S:{u.permissions?.servers}</td>
                      <td className="px-6 py-4">{u.role !== 'admin' && <button onClick={() => { const users = JSON.parse(localStorage.getItem('ozone_users') || '[]'); localStorage.setItem('ozone_users', JSON.stringify(users.filter(user => user.username !== u.username))); setView('users'); }} className="text-red-400 text-xs font-bold hover:text-red-300">DELETE</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showModal && modalType === 'user' && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-slate-900/95 to-slate-950/95 border border-cyan-500/40 rounded-2xl max-w-md w-full p-8 shadow-2xl shadow-cyan-500/10">
            <h3 className="text-xl font-black text-cyan-300 mb-6 tracking-wide">ADD USER</h3>
            <form onSubmit={(e) => { e.preventDefault(); const users = JSON.parse(localStorage.getItem('ozone_users') || '[]'); users.push({ username: formData.username, password: formData.password, role: 'user', permissions: { dashboard: formData.dashboardPerm || 'r', history: formData.historyPerm || 'r', servers: formData.serversPerm || 'r' } }); localStorage.setItem('ozone_users', JSON.stringify(users)); setShowModal(false); setFormData({}); alert('User created'); }} className="space-y-5">
              <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">USERNAME</label><input type="text" required value={formData.username || ''} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium focus:border-cyan-400/60" /></div>
              <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">PASSWORD</label><input type="password" required value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium focus:border-cyan-400/60" /></div>
              <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">DASHBOARD (r/rw)</label><input type="text" value={formData.dashboardPerm || 'r'} onChange={(e) => setFormData({ ...formData, dashboardPerm: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium" /></div>
              <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">HISTORY (r/rw)</label><input type="text" value={formData.historyPerm || 'r'} onChange={(e) => setFormData({ ...formData, historyPerm: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium" /></div>
              <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">SERVERS (r/rw/rwd)</label><input type="text" value={formData.serversPerm || 'r'} onChange={(e) => setFormData({ ...formData, serversPerm: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium" /></div>
              <div className="flex justify-end space-x-3 pt-4"><button type="button" onClick={() => { setShowModal(false); setFormData({}); }} className="px-6 py-3 text-cyan-500 bg-slate-900/70 rounded-xl font-bold hover:bg-slate-900">CANCEL</button><button type="submit" className="px-6 py-3 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 rounded-xl border border-cyan-400/50 font-bold hover:from-cyan-500/40 hover:to-blue-500/40">CREATE</button></div>
            </form>
          </div>
        </div>
      )}

      {showModal && modalType !== 'user' && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-slate-900/95 to-slate-950/95 border border-cyan-500/40 rounded-2xl max-w-md w-full p-8 shadow-2xl shadow-cyan-500/10">
            <h3 className="text-xl font-black text-cyan-300 mb-6 tracking-wide">{formData.id ? 'EDIT' : 'ADD'} {modalType === 'server' ? 'SERVER' : 'APPLICATION'}</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              {modalType === 'server' ? (
                <>
                  <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">SERVER NAME</label><input type="text" required value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium focus:border-cyan-400/60" /></div>
                  <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">HOST/IP ADDRESS</label><input type="text" required value={formData.host || ''} onChange={(e) => setFormData({ ...formData, host: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium focus:border-cyan-400/60" /></div>
                </>
              ) : (
                <>
                  <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">APPLICATION NAME</label><input type="text" required value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium focus:border-cyan-400/60" /></div>
                  <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">PORT NUMBER</label><input type="number" value={formData.port || ''} onChange={(e) => setFormData({ ...formData, port: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium font-mono" /></div>
                  <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">HEALTH CHECK URL</label><input type="text" value={formData.health_url || ''} onChange={(e) => setFormData({ ...formData, health_url: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium text-sm" placeholder="http://server/health" /></div>
                  <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">CHECK INTERVAL (seconds)</label><input type="number" value={formData.check_interval || 60} onChange={(e) => setFormData({ ...formData, check_interval: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium font-mono" /></div>
                  <div><label className="block text-xs font-bold text-cyan-400/80 mb-2 tracking-wider">RESPONSE THRESHOLD (ms)</label><input type="number" value={formData.response_threshold || 4000} onChange={(e) => setFormData({ ...formData, response_threshold: e.target.value })} className="w-full px-4 py-3 bg-slate-900/70 border border-cyan-500/30 rounded-xl text-cyan-100 font-medium font-mono" /></div>
                </>
              )}
              <div className="flex justify-end space-x-3 pt-4"><button type="button" onClick={() => { setShowModal(false); setFormData({}); }} className="px-6 py-3 text-cyan-500 bg-slate-900/70 rounded-xl font-bold hover:bg-slate-900">CANCEL</button><button type="submit" className="px-6 py-3 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 rounded-xl border border-cyan-400/50 font-bold hover:from-cyan-500/40 hover:to-blue-500/40">{formData.id ? 'UPDATE' : 'CREATE'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

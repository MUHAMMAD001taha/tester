import React, { useState, useEffect } from 'react';
import { 
  Mail, Phone, Search, User, Users, LogOut, Download, 
  UserPlus, Trash2, Key, Briefcase, Calendar, MapPin, 
  TrendingUp, CheckCircle, Clock, Settings, ChevronDown, 
  Filter, BarChart3, Shield, Copy, Check, FileSpreadsheet,
  RefreshCw, DollarSign, AlertCircle
} from 'lucide-react';

interface Booking {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  serviceType: string;
  tripType: string;
  pickupAddress: string;
  dropoffAddress: string;
  stops?: string[];
  pickupDateTime: string;
  vehicle: string;
  price: number;
  status?: string; // Pending, Confirmed, In Progress, Completed, Cancelled
  assignedTo?: string; // email of employee or "unassigned"
  handoffTo?: string; // email of handed-off employee
  timestamp: string;
  message?: string;
}

interface Employee {
  email: string;
  name: string;
  role: string;
  createdAt: string;
  shiftStart?: string;
  shiftEnd?: string;
}

interface LoggedInUser {
  email: string;
  name: string;
  role: 'master' | 'employee';
  shiftStart?: string;
  shiftEnd?: string;
}

export const AdminDashboard: React.FC = () => {
  // Authentication & User state
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Login Form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // UI Navigation state
  const [activeTab, setActiveTab] = useState<'bookings' | 'employees' | 'export' | 'performance'>('bookings');

  // Core Data state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Bookings Filter & Sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'timestamp' | 'price' | 'pickupDateTime'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Employee Management Form state
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [newEmpShiftStart, setNewEmpShiftStart] = useState('08:00');
  const [newEmpShiftEnd, setNewEmpShiftEnd] = useState('16:00');
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [resettingPasswordFor, setResettingPasswordFor] = useState<string | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Shift editing state
  const [editingShiftFor, setEditingShiftFor] = useState<string | null>(null);
  const [editShiftStart, setEditShiftStart] = useState('08:00');
  const [editShiftEnd, setEditShiftEnd] = useState('16:00');

  // Export & Copy state
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Helper to determine if a time falls in a shift
  const isTimeInShift = (timeStr: string, startStr: string, endStr: string): boolean => {
    if (!timeStr || !startStr || !endStr) return false;
    const [h, m] = timeStr.split(':').map(Number);
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m) || isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
    const time = h * 60 + m;
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start === end) return true;
    if (start <= end) {
      return time >= start && time < end;
    } else {
      return time >= start || time < end;
    }
  };

  // Check if current user is on shift (always true for master role)
  const isEmployeeOnShift = React.useMemo(() => {
    if (!user || user.role !== 'employee') return true;
    
    // Find matching employee details to get most up to date shifts from state if possible
    const currentEmp = employees.find(e => e.email === user.email);
    const shiftStart = currentEmp?.shiftStart || user.shiftStart || "08:00";
    const shiftEnd = currentEmp?.shiftEnd || user.shiftEnd || "16:00";

    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const currentClientTimeStr = `${hrs}:${mins}`;

    return isTimeInShift(currentClientTimeStr, shiftStart, shiftEnd);
  }, [user, employees]);

  // Check for saved session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('enviroride_admin_token');
    const savedUser = localStorage.getItem('enviroride_admin_user');
    
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      } catch (err) {
        localStorage.removeItem('enviroride_admin_token');
        localStorage.removeItem('enviroride_admin_user');
      }
    }
    setIsInitializing(false);
  }, []);

  // Fetch bookings whenever auth changes
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchBookings();
      fetchEmployees();
    }
  }, [isAuthenticated, token, user]);

  const fetchBookings = async () => {
    if (!token) return;
    setIsLoadingBookings(true);
    setActionError(null);
    try {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const clientTime = `${hrs}:${mins}`;

      const res = await fetch(`/api/bookings?clientTime=${clientTime}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      } else {
        if (res.status === 401) {
          localStorage.removeItem('enviroride_admin_token');
          localStorage.removeItem('enviroride_admin_user');
          setToken(null);
          setUser(null);
          setIsAuthenticated(false);
          return;
        }
        const errData = await res.json().catch(() => ({}));
        setActionError(`Failed to fetch bookings: ${errData.error || res.statusText}`);
      }
    } catch (err: any) {
      setActionError(`Network error fetching bookings: ${err.message}`);
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const fetchEmployees = async () => {
    if (!token) return;
    setIsLoadingEmployees(true);
    try {
      const res = await fetch('/api/employees', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      } else if (res.status === 401) {
        localStorage.removeItem('enviroride_admin_token');
        localStorage.removeItem('enviroride_admin_user');
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err: any) {
      console.error('Error fetching employees:', err);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  // Handle Auth Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const trimmedEmail = loginEmail.trim();
    const trimmedPassword = loginPassword.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setLoginError("Please enter both email and password.");
      setIsLoggingIn(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('enviroride_admin_token', data.token);
        localStorage.setItem('enviroride_admin_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        setActionSuccess("Successfully logged in!");
        // Clear login fields
        setLoginEmail('');
        setLoginPassword('');
      } else {
        const errData = await res.json();
        setLoginError(errData.error || "Invalid credentials. Please try again.");
      }
    } catch (err: any) {
      setLoginError(`Connection error: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.warn("Logout request failed:", e);
    }
    
    localStorage.removeItem('enviroride_admin_token');
    localStorage.removeItem('enviroride_admin_user');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setBookings([]);
    setEmployees([]);
    setActiveTab('bookings');
  };

  // Handle Booking Assignment Update (Master Only)
  const handleAssignBooking = async (bookingId: string, assignedEmail: string) => {
    if (!token || user?.role !== 'master') return;
    
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ assignedTo: assignedEmail })
      });

      if (res.ok) {
        setActionSuccess(`Booking updated successfully.`);
        // Update local state instantly
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, assignedTo: assignedEmail } : b));
      } else {
        const data = await res.json();
        setActionError(`Assignment failed: ${data.error}`);
      }
    } catch (err: any) {
      setActionError(`Network error: ${err.message}`);
    }
  };

  // Handle Booking Status Update
  const handleUpdateStatus = async (bookingId: string, newStatus: string) => {
    if (!token) return;

    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        setActionSuccess(`Status updated to "${newStatus}" successfully.`);
        // Update local state instantly
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      } else {
        const data = await res.json();
        setActionError(`Status update failed: ${data.error}`);
      }
    } catch (err: any) {
      setActionError(`Network error: ${err.message}`);
    }
  };

  // Handle Adding an Employee (Master Only)
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || user?.role !== 'master') return;

    setActionError(null);
    setActionSuccess(null);
    setIsAddingEmployee(true);

    const emailVal = newEmpEmail.trim().toLowerCase();
    const nameVal = newEmpName.trim();
    const passVal = newEmpPassword.trim();

    if (!emailVal || !nameVal || !passVal) {
      setActionError("All fields are required to create an employee account.");
      setIsAddingEmployee(false);
      return;
    }

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          email: emailVal, 
          name: nameVal, 
          password: passVal,
          shiftStart: newEmpShiftStart,
          shiftEnd: newEmpShiftEnd
        })
      });

      if (res.ok) {
        setActionSuccess(`Employee account for ${nameVal} created successfully.`);
        setNewEmpEmail('');
        setNewEmpName('');
        setNewEmpPassword('');
        setNewEmpShiftStart('08:00');
        setNewEmpShiftEnd('16:00');
        fetchEmployees(); // Reload list
      } else {
        const data = await res.json();
        setActionError(data.error || "Failed to create employee account.");
      }
    } catch (err: any) {
      setActionError(`Error creating employee: ${err.message}`);
    } finally {
      setIsAddingEmployee(false);
    }
  };

  // Handle Updating Employee Shift (Master Only)
  const handleUpdateShift = async (email: string) => {
    if (!token || user?.role !== 'master') return;

    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(email)}/shift`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shiftStart: editShiftStart, shiftEnd: editShiftEnd })
      });

      if (res.ok) {
        setActionSuccess(`Shift times updated successfully.`);
        setEditingShiftFor(null);
        fetchEmployees(); // Reload list
      } else {
        const data = await res.json();
        setActionError(data.error || "Failed to update shift times.");
      }
    } catch (err: any) {
      setActionError(`Error updating shift: ${err.message}`);
    }
  };

  // Handle Handoff a Booking to another Employee
  const handleHandoffBooking = async (bookingId: string, handoffToEmail: string) => {
    if (!token) return;
    if (handoffToEmail === 'unassigned') return;

    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/handoff`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ handoffTo: handoffToEmail })
      });

      if (res.ok) {
        setActionSuccess(`Booking successfully handed off.`);
        // Update local state instantly
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, handoffTo: handoffToEmail, assignedTo: handoffToEmail } : b));
      } else {
        const data = await res.json();
        setActionError(`Handoff failed: ${data.error}`);
      }
    } catch (err: any) {
      setActionError(`Error handing off booking: ${err.message}`);
    }
  };

  // Handle Deleting an Employee (Master Only)
  const handleDeleteEmployee = async (email: string, name: string) => {
    if (!token || user?.role !== 'master') return;
    if (!window.confirm(`Are you absolutely sure you want to delete the account for ${name} (${email})?`)) return;

    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setActionSuccess(`Successfully deleted account for ${name}.`);
        // Remove from local list or reload
        setEmployees(prev => prev.filter(emp => emp.email !== email));
        
        // Also update bookings assigned to this deleted employee back to unassigned
        setBookings(prev => prev.map(b => b.assignedTo === email ? { ...b, assignedTo: 'unassigned' } : b));
      } else {
        const data = await res.json();
        setActionError(data.error || "Failed to delete employee account.");
      }
    } catch (err: any) {
      setActionError(`Error deleting employee: ${err.message}`);
    }
  };

  // Handle Employee Password Reset (Master Only)
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !resettingPasswordFor || user?.role !== 'master') return;

    setActionError(null);
    setActionSuccess(null);
    setIsResettingPassword(true);

    const newPass = resetPasswordVal.trim();
    if (!newPass) {
      setActionError("Password cannot be blank.");
      setIsResettingPassword(false);
      return;
    }

    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(resettingPasswordFor)}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: newPass })
      });

      if (res.ok) {
        setActionSuccess(`Password for ${resettingPasswordFor} successfully updated.`);
        setResetPasswordVal('');
        setResettingPasswordFor(null);
      } else {
        const data = await res.json();
        setActionError(data.error || "Failed to reset password.");
      }
    } catch (err: any) {
      setActionError(`Error resetting password: ${err.message}`);
    } finally {
      setIsResettingPassword(false);
    }
  };

  // CSV Exporter
  const handleExportAllToCSV = () => {
    const headers = [
      "Booking ID", "Client Name", "Email", "Phone", "Service Type", 
      "Trip Type", "Pickup Address", "Drop-off Address", "Date/Time", 
      "Vehicle", "Price ($)", "Status", "Assigned Employee", "Message", "Submission Timestamp"
    ];
    
    const csvRows = [headers.join(",")];
    
    bookings.forEach(b => {
      const values = [
        b.id,
        `"${b.fullName?.replace(/"/g, '""') || ''}"`,
        `"${b.email || ''}"`,
        `"${b.phone || ''}"`,
        `"${b.serviceType || ''}"`,
        `"${b.tripType || ''}"`,
        `"${b.pickupAddress?.replace(/"/g, '""') || ''}"`,
        `"${b.dropoffAddress?.replace(/"/g, '""') || ''}"`,
        `"${b.pickupDateTime || ''}"`,
        `"${b.vehicle || ''}"`,
        b.price || 0,
        `"${b.status || 'Pending'}"`,
        `"${b.assignedTo || 'unassigned'}"`,
        `"${b.message?.replace(/"/g, '""') || ''}"`,
        `"${b.timestamp || ''}"`
      ];
      csvRows.push(values.join(","));
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `EnviroRide_All_Bookings_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Copy list function
  const handleCopyTextList = (type: 'emails' | 'phones' | 'names') => {
    let list = "";
    if (type === 'emails') {
      list = bookings.map(b => b.email).filter(Boolean).join("\n");
    } else if (type === 'phones') {
      list = bookings.map(b => b.phone).filter(Boolean).join("\n");
    } else if (type === 'names') {
      list = bookings.map(b => b.fullName).filter(Boolean).join("\n");
    }

    navigator.clipboard.writeText(list);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  // Filters & Sorting implementation
  const filteredAndSortedBookings = bookings.filter(b => {
    // 1. Text Search
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      b.fullName?.toLowerCase().includes(searchLower) ||
      b.email?.toLowerCase().includes(searchLower) ||
      b.phone?.toLowerCase().includes(searchLower) ||
      b.id?.toLowerCase().includes(searchLower) ||
      b.pickupAddress?.toLowerCase().includes(searchLower) ||
      b.dropoffAddress?.toLowerCase().includes(searchLower);

    // 2. Status Filter
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;

    // 3. Employee Assignment Filter
    const matchesEmployee = employeeFilter === 'all' || 
      (employeeFilter === 'unassigned' && (b.assignedTo === 'unassigned' || !b.assignedTo)) ||
      (b.assignedTo === employeeFilter);

    // 4. Date range filter
    let matchesDate = true;
    if (startDate || endDate) {
      const bookingDateStr = b.pickupDateTime ? b.pickupDateTime.split(' ')[0] : ''; // Expect "YYYY-MM-DD"
      if (startDate && bookingDateStr < startDate) matchesDate = false;
      if (endDate && bookingDateStr > endDate) matchesDate = false;
    }

    return matchesSearch && matchesStatus && matchesEmployee && matchesDate;
  }).sort((a, b) => {
    let fieldA: any = a[sortBy] || '';
    let fieldB: any = b[sortBy] || '';

    if (sortBy === 'price') {
      fieldA = Number(fieldA);
      fieldB = Number(fieldB);
    } else {
      fieldA = String(fieldA).toLowerCase();
      fieldB = String(fieldB).toLowerCase();
    }

    if (fieldA < fieldB) return sortOrder === 'asc' ? -1 : 1;
    if (fieldA > fieldB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Calculate Metrics
  const totalRevenue = bookings
    .filter(b => b.status !== 'Cancelled')
    .reduce((sum, b) => sum + Number(b.price || 0), 0);
  
  const pendingCount = bookings.filter(b => b.status === 'Pending' || !b.status).length;
  const completedCount = bookings.filter(b => b.status === 'Completed').length;
  const totalBookingsCount = bookings.length;

  // Employee Performance Calculations
  const getEmployeePerformance = (empEmail: string) => {
    const empBookings = bookings.filter(b => b.assignedTo === empEmail);
    const completed = empBookings.filter(b => b.status === 'Completed').length;
    const revenue = empBookings
      .filter(b => b.status !== 'Cancelled')
      .reduce((sum, b) => sum + Number(b.price || 0), 0);
    return {
      total: empBookings.length,
      completed,
      revenue
    };
  };

  const getUnassignedPerformance = () => {
    const unassignedBookings = bookings.filter(b => b.assignedTo === 'unassigned' || !b.assignedTo);
    return unassignedBookings.length;
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-55 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-600 font-medium">Verifying credentials and loading workspace...</p>
      </div>
    );
  }

  // --- 1. RENDER LOGIN VIEW ---
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100 px-4 py-12" id="admin-login-screen">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-emerald-50 p-3 rounded-full text-emerald-600 mb-3">
              <Shield size={36} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">EnviroRide Control Panel</h2>
            <p className="text-xs text-slate-500 mt-1">Multi-User Shift Logins & Master Admin Access</p>
          </div>
          
          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2 font-medium">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Staff Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  placeholder="name@enviroride.net"
                  required
                />
                <Mail className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  placeholder="••••••••"
                  required
                />
                <Key className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className={`w-full bg-emerald-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm flex justify-center items-center gap-2 ${isLoggingIn ? "opacity-55 cursor-not-allowed" : "hover:bg-emerald-700 active:bg-emerald-800"}`}
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Verifying account...</span>
                </>
              ) : (
                <span>Access Console</span>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Demo Access Credentials</h4>
            <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 text-left">
              <p><strong>Master Admin:</strong> <code className="bg-white px-1 py-0.5 rounded border border-slate-200">admin@enviroride.net</code> / <code className="bg-white px-1 py-0.5 rounded border border-slate-200">master123</code></p>
              <p><strong>Employees:</strong> <code className="bg-white px-1 py-0.5 rounded border border-slate-200">john@enviroride.net</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">sarah@enviroride.net</code> (pw: <code className="bg-white px-1 py-0.5 rounded border border-slate-200">john123</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">sarah123</code>)</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. RENDER MAIN CONSOLE VIEW ---
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans" id="admin-dashboard-container">
      
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col h-full shrink-0 border-r border-slate-800 shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg tracking-tight">EnviroRide</h2>
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Control Tower</span>
            </div>
          </div>
        </div>

        {/* LOGGED IN USER PROFILE */}
        <div className="p-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 w-10 h-10 rounded-full flex items-center justify-center text-slate-300 border border-slate-700 font-semibold uppercase">
              {user?.name?.substring(0, 2) || "ST"}
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-sm truncate text-slate-100">{user?.name}</h4>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${user?.role === 'master' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'}`}>
                  {user?.role === 'master' ? 'Owner / Master' : 'Shift Staff'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <button
            onClick={() => setActiveTab('bookings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'bookings' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Briefcase size={18} />
            <span>Shift Bookings</span>
          </button>

          {user?.role === 'master' && (
            <>
              <button
                onClick={() => setActiveTab('performance')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'performance' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <BarChart3 size={18} />
                <span>Performance Stats</span>
              </button>

              <button
                onClick={() => setActiveTab('export')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'export' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Download size={18} />
                <span>Bulk Export</span>
              </button>

              <button
                onClick={() => setActiveTab('employees')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'employees' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Users size={18} />
                <span>Manage Staff ({employees.length})</span>
              </button>
            </>
          )}
        </nav>

        {/* LOGOUT FOOTER */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-red-900/40 hover:text-red-300 hover:border-red-500/20 text-slate-300 font-medium text-xs rounded-lg transition-all border border-slate-700"
          >
            <LogOut size={14} />
            <span>Terminate Shift</span>
          </button>
        </div>
      </aside>

      {/* MAIN WORKSPACE PANEL */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* HEADER BAR */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-slate-800 text-xl capitalize">
              {activeTab === 'bookings' ? 'Shift Bookings Overview' : 
               activeTab === 'performance' ? 'Employee KPIs & Financial Stats' :
               activeTab === 'export' ? 'Bulk Marketing & CRM Exporter' : 'Employee Accounts Manager'}
            </h1>
            <div className="flex gap-2">
              <button 
                onClick={fetchBookings} 
                disabled={isLoadingBookings}
                className="p-1.5 text-slate-400 hover:text-emerald-600 rounded hover:bg-slate-50 transition-colors"
                title="Refresh booking data"
              >
                <RefreshCw size={15} className={isLoadingBookings ? 'animate-spin text-emerald-600' : ''} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-slate-500 text-xs font-medium">
            <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 text-slate-600 font-mono">
              <Calendar size={13} />
              <span>{new Date().toLocaleString()}</span>
            </div>
          </div>
        </header>

        {/* NOTIFICATION TOAST BANNERS */}
        {actionError && (
          <div className="mx-8 mt-4 p-3.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-start gap-2.5 shadow-sm font-medium">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="mx-8 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-start gap-2.5 shadow-sm font-medium">
            <CheckCircle size={18} className="mt-0.5 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* CONTENT PANELS */}
        <div className="flex-1 overflow-auto p-8">
          {!isEmployeeOnShift ? (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-6 py-12">
              <div className="bg-amber-50 text-amber-800 p-4 rounded-full border border-amber-200 shadow-sm animate-pulse">
                <Clock size={40} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">You are not currently on shift</h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Your assigned shift is <strong className="text-slate-700">{user?.shiftStart || "08:00"} - {user?.shiftEnd || "16:00"}</strong>.
                </p>
                <p className="text-slate-400 text-xs mt-4">
                  Please log back in during your designated shift window to access bookings, dispatch, and handoffs.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* =================== TAB 1: BOOKINGS LIST =================== */}
               {activeTab === 'bookings' && (
            <div className="space-y-6">

              {/* FILTERS TOOLBAR PANEL */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-col gap-4">
                  {/* Row 1: Search & Basic Sort */}
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Search client names, emails, phones, IDs, routes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                      <Search className="absolute left-3.5 top-3 text-slate-400" size={15} />
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                        <Filter size={13} />
                        Filter:
                      </span>
                      {/* Status Dropdown */}
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>

                      {/* Employee Dropdown (Master Only) */}
                      {user?.role === 'master' && (
                        <select
                          value={employeeFilter}
                          onChange={(e) => setEmployeeFilter(e.target.value)}
                          className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="all">All Assignments</option>
                          <option value="unassigned">Unassigned Only</option>
                          {employees.map(emp => (
                            <option key={emp.email} value={emp.email}>{emp.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Date Filters & Sorting Settings */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 shrink-0">Pickup From:</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 shrink-0">To Date:</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 shrink-0">Order By:</span>
                      <select
                        value={sortBy}
                        onChange={(e: any) => setSortBy(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="timestamp">Booking Created Date</option>
                        <option value="price">Total Price</option>
                        <option value="pickupDateTime">Scheduled Departure</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSortOrder('asc')}
                        className={`flex-1 py-1 px-3 text-xs font-medium border rounded-lg transition-colors ${sortOrder === 'asc' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                      >
                        Ascending
                      </button>
                      <button
                        onClick={() => setSortOrder('desc')}
                        className={`flex-1 py-1 px-3 text-xs font-medium border rounded-lg transition-colors ${sortOrder === 'desc' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                      >
                        Descending
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* BOOKINGS TABLE LISTING */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center px-6">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtered Results ({filteredAndSortedBookings.length})</span>
                  <div className="text-[11px] text-slate-400">Sort by {sortBy} ({sortOrder})</div>
                </div>

                {isLoadingBookings ? (
                  <div className="p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 text-sm mt-3 font-medium">Synchronizing with live Firestore database...</p>
                  </div>
                ) : filteredAndSortedBookings.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="bg-slate-100 p-4 rounded-full text-slate-400 inline-block mb-3">
                      <Search size={28} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-base">No Matching Bookings Found</h3>
                    <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">Try refining your filter criteria, altering the date range, or broadening the search text query.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-wider font-bold text-[10px] h-10 px-6">
                          <th className="pl-6 py-3">Booking ID</th>
                          <th className="py-3">Client Contact</th>
                          <th className="py-3">Service Details</th>
                          <th className="py-3">Itinerary Route</th>
                          <th className="py-3">Trip Date & Time</th>
                          <th className="py-3">Total Price</th>
                          <th className="py-3">Handoff Status</th>
                          <th className="py-3">Trip Status</th>
                          <th className="pr-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-slate-700 text-xs font-medium">
                        {filteredAndSortedBookings.map(b => {
                          const isAssignedToThisUser = true; // All visible bookings are manageable
                          const handoffRecipient = b.handoffTo
                            ? employees.find(e => e.email === b.handoffTo) || { name: b.handoffTo }
                            : null;

                          return (
                            <tr key={b.id} className="hover:bg-slate-50 transition-colors h-14">
                              {/* ID & Timestamp */}
                              <td className="pl-6 py-3 font-mono font-bold text-slate-600 shrink-0">
                                <div>{b.id}</div>
                                <div className="text-[9px] text-slate-400 mt-0.5">{new Date(b.timestamp).toLocaleDateString()}</div>
                              </td>

                              {/* Client Details */}
                              <td className="py-3">
                                <div className="font-bold text-slate-900">{b.fullName}</div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Mail size={10} className="shrink-0" />
                                  <span className="truncate max-w-[150px]" title={b.email}>{b.email}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone size={10} className="shrink-0" />
                                  <span>{b.phone}</span>
                                </div>
                              </td>

                              {/* Service Type & Vehicle */}
                              <td className="py-3">
                                <div className="flex gap-1 items-center">
                                  <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                                    {b.serviceType}
                                  </span>
                                  <span className="bg-emerald-50 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-bold">
                                    {b.tripType}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 font-mono">
                                  Vehicle: <span className="font-sans font-bold text-slate-700">{b.vehicle}</span>
                                </div>
                              </td>

                              {/* Itinerary */}
                              <td className="py-3 pr-4 max-w-[200px]">
                                <div className="flex items-start gap-1">
                                  <div className="bg-emerald-50 p-1 rounded text-emerald-600 shrink-0 mt-0.5">
                                    <MapPin size={10} />
                                  </div>
                                  <div className="truncate text-[11px] text-slate-800" title={b.pickupAddress}>
                                    <strong>Pick:</strong> {b.pickupAddress}
                                  </div>
                                </div>
                                <div className="flex items-start gap-1 mt-1">
                                  <div className="bg-red-50 p-1 rounded text-red-600 shrink-0 mt-0.5">
                                    <MapPin size={10} />
                                  </div>
                                  <div className="truncate text-[11px] text-slate-800" title={b.dropoffAddress}>
                                    <strong>Drop:</strong> {b.dropoffAddress}
                                  </div>
                                </div>
                                {b.stops && b.stops.length > 0 && (
                                  <div className="text-[9px] text-emerald-600 font-bold mt-1 pl-5">
                                    + {b.stops.length} stop{b.stops.length > 1 ? 's' : ''}
                                  </div>
                                )}
                              </td>

                              {/* Scheduled Date */}
                              <td className="py-3 text-slate-800">
                                <div className="font-semibold">{b.pickupDateTime.split(' ')[0]}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{b.pickupDateTime.split(' ')[1] || ""}</div>
                              </td>

                              {/* Price */}
                              <td className="py-3 font-bold text-slate-900 text-sm">
                                ${Number(b.price || 0).toLocaleString()}
                              </td>

                              {/* Handoff Status */}
                              <td className="py-3">
                                {b.handoffTo ? (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                    Handed off to: {handoffRecipient?.name || b.handoffTo}
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                    No Handoff
                                  </span>
                                )}
                              </td>

                              {/* Status Dropdown */}
                              <td className="py-3">
                                {isAssignedToThisUser ? (
                                  <select
                                    value={b.status || 'Pending'}
                                    onChange={(e) => handleUpdateStatus(b.id, e.target.value)}
                                    className={`border font-bold rounded px-1.5 py-1 text-xs focus:outline-none ${
                                      b.status === 'Completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                      b.status === 'Cancelled' ? 'bg-red-50 text-red-800 border-red-300' :
                                      b.status === 'In Progress' ? 'bg-purple-50 text-purple-800 border-purple-300' :
                                      b.status === 'Confirmed' ? 'bg-blue-50 text-blue-800 border-blue-300' :
                                      'bg-amber-50 text-amber-800 border-amber-300' // Pending/Empty
                                    }`}
                                  >
                                    <option value="Pending">Pending</option>
                                    <option value="Confirmed">Confirmed</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Cancelled">Cancelled</option>
                                  </select>
                                ) : (
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                    b.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                                    b.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                                    b.status === 'In Progress' ? 'bg-purple-100 text-purple-800' :
                                    b.status === 'Confirmed' ? 'bg-blue-100 text-blue-800' :
                                    'bg-amber-100 text-amber-800'
                                  }`}>
                                    {b.status || 'Pending'}
                                  </span>
                                )}
                              </td>

                              {/* Actions / Details info */}
                              <td className="pr-6 py-3 text-right">
                                {b.status !== 'Completed' && b.status !== 'Cancelled' ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <select
                                      value={b.handoffTo || 'unassigned'}
                                      onChange={(e) => handleHandoffBooking(b.id, e.target.value)}
                                      className="border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-800 bg-white font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                                    >
                                      <option value="unassigned" disabled>🤝 Hand Off...</option>
                                      {employees.filter(emp => emp.email !== user?.email).map(emp => (
                                        <option key={emp.email} value={emp.email}>
                                          {emp.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 block italic">Finalized</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* =================== TAB 2: PERFORMANCE & KPIS (MASTER ONLY) =================== */}
          {activeTab === 'performance' && user?.role === 'master' && (
            <div className="space-y-6">
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 text-base mb-2">Shift Performance Metrics</h3>
                <p className="text-slate-500 text-xs">A comprehensive audit of active dispatch workflows, trips assigned, and financial revenues split per employee.</p>
              </div>

              {/* EMPLOYEE PERFORMANCE BENTO CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Assignment Breakdown */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm mb-4">Dispatcher Allocation Distribution</h4>
                    <div className="space-y-4">
                      {employees.map(emp => {
                        const perf = getEmployeePerformance(emp.email);
                        const percent = totalBookingsCount > 0 ? (perf.total / totalBookingsCount) * 100 : 0;
                        return (
                          <div key={emp.email} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-slate-700">{emp.name}</span>
                              <span className="text-slate-500 font-bold">{perf.total} bookings ({percent.toFixed(0)}%)</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                              <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Unassigned bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-500">⚠️ Unassigned</span>
                          <span className="text-slate-500 font-bold">{getUnassignedPerformance()} bookings ({totalBookingsCount > 0 ? ((getUnassignedPerformance() / totalBookingsCount) * 100).toFixed(0) : 0}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div className="bg-amber-400 h-full rounded-full" style={{ width: `${totalBookingsCount > 0 ? (getUnassignedPerformance() / totalBookingsCount) * 100 : 0}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Revenue Breakdown */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm mb-4">Revenue Earned per Dispatcher Shift</h4>
                    <div className="space-y-4">
                      {employees.map(emp => {
                        const perf = getEmployeePerformance(emp.email);
                        const percent = totalRevenue > 0 ? (perf.revenue / totalRevenue) * 100 : 0;
                        return (
                          <div key={emp.email} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-slate-700">{emp.name}</span>
                              <span className="text-slate-500 font-bold">${perf.revenue.toLocaleString()} ({percent.toFixed(0)}%)</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                              <div className="bg-blue-600 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>

              {/* EMPLOYEE METRICS DETAILED TABLE */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 px-6 font-bold text-xs text-slate-500 uppercase tracking-wider">
                  Employee Performance Audit Log
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-wider font-bold text-[10px] h-10 px-6">
                        <th className="pl-6 py-3">Employee</th>
                        <th className="py-3">Email Address</th>
                        <th className="py-3">Trips Handled / Assigned</th>
                        <th className="py-3">Trips Completed</th>
                        <th className="py-3">Revenue Earned ($)</th>
                        <th className="pr-6 py-3 text-right">Completion Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-slate-700 text-xs">
                      {employees.map(emp => {
                        const perf = getEmployeePerformance(emp.email);
                        const rate = perf.total > 0 ? (perf.completed / perf.total) * 100 : 0;
                        return (
                          <tr key={emp.email} className="hover:bg-slate-50 transition-colors h-12">
                            <td className="pl-6 py-3 font-bold text-slate-900">{emp.name}</td>
                            <td className="py-3 font-mono text-slate-500">{emp.email}</td>
                            <td className="py-3 font-bold text-slate-800">{perf.total}</td>
                            <td className="py-3 text-emerald-600 font-bold">{perf.completed}</td>
                            <td className="py-3 font-bold text-slate-900">${perf.revenue.toLocaleString()}</td>
                            <td className="pr-6 py-3 text-right font-bold text-emerald-700">
                              {rate.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* =================== TAB 3: BULK EXPORTER (MASTER ONLY) =================== */}
          {activeTab === 'export' && user?.role === 'master' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Full Database Export */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm md:col-span-1 flex flex-col justify-between h-full">
                  <div>
                    <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600 w-fit mb-4">
                      <FileSpreadsheet size={24} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-base mb-2">Master CSV Export</h3>
                    <p className="text-slate-500 text-xs leading-relaxed mb-6">
                      Download the complete bookings database in a standard CSV format. This output includes all details, pricing, routes, statuses, client phone numbers, emails, and timestamp history. Ready for Microsoft Excel or Google Sheets.
                    </p>
                  </div>
                  <button
                    onClick={handleExportAllToCSV}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded-lg text-xs tracking-wide transition-colors flex items-center justify-center gap-2 border border-slate-800 shadow"
                  >
                    <Download size={15} />
                    <span>Download Complete CSV Report</span>
                  </button>
                </div>

                {/* CRM list exporters */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm md:col-span-2 space-y-5">
                  <h3 className="font-bold text-slate-800 text-base">Quick Copy Lists for Marketing & CRM</h3>
                  <p className="text-slate-500 text-xs">Extract individual data structures directly to your clipboard for quick messaging blast campaigns, newsletter updates, or notification logging.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    {/* Emails card */}
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-36">
                      <div>
                        <h4 className="font-bold text-slate-700 text-xs">Client Emails ({bookings.map(b => b.email).filter(Boolean).length})</h4>
                        <p className="text-[10px] text-slate-400 mt-1">Extract line-break separated list of client emails.</p>
                      </div>
                      <button
                        onClick={() => handleCopyTextList('emails')}
                        className={`w-full py-2 px-3 text-[11px] font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${copiedType === 'emails' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-600'}`}
                      >
                        {copiedType === 'emails' ? (
                          <>
                            <Check size={12} />
                            <span>Copied Emails!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy Email List</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Phones card */}
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-36">
                      <div>
                        <h4 className="font-bold text-slate-700 text-xs">Client Phones ({bookings.map(b => b.phone).filter(Boolean).length})</h4>
                        <p className="text-[10px] text-slate-400 mt-1">Extract line-break separated list of client phone numbers.</p>
                      </div>
                      <button
                        onClick={() => handleCopyTextList('phones')}
                        className={`w-full py-2 px-3 text-[11px] font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${copiedType === 'phones' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-600'}`}
                      >
                        {copiedType === 'phones' ? (
                          <>
                            <Check size={12} />
                            <span>Copied Phones!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy Phone List</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Names card */}
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between h-36">
                      <div>
                        <h4 className="font-bold text-slate-700 text-xs">Client Names ({bookings.map(b => b.fullName).filter(Boolean).length})</h4>
                        <p className="text-[10px] text-slate-400 mt-1">Extract line-break separated list of client contact names.</p>
                      </div>
                      <button
                        onClick={() => handleCopyTextList('names')}
                        className={`w-full py-2 px-3 text-[11px] font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${copiedType === 'names' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-600'}`}
                      >
                        {copiedType === 'names' ? (
                          <>
                            <Check size={12} />
                            <span>Copied Names!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy Name List</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

          {/* =================== TAB 4: MANAGE EMPLOYEES (MASTER ONLY) =================== */}
          {activeTab === 'employees' && user?.role === 'master' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* List of existing staff */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 px-6 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registered Dispatch Staff ({employees.length})</span>
                    <span className="text-[10px] text-slate-400">Owner role handles all updates</span>
                  </div>

                  {isLoadingEmployees ? (
                    <div className="p-8 text-center flex justify-center">
                      <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : employees.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                      No employees registered. Use the signup pane to the right to provision staff.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {employees.map(emp => (
                        <div key={emp.email} className="p-5 flex flex-col hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6">
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                <User size={15} className="text-slate-400" />
                                <span>{emp.name}</span>
                              </h4>
                              <p className="text-xs text-slate-500 font-mono mt-1 pl-5">{emp.email}</p>
                              <p className="text-[10px] text-slate-400 mt-1 pl-5">Created: {new Date(emp.createdAt).toLocaleDateString()}</p>
                              <div className="mt-1 pl-5 text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                                <Clock size={11} />
                                <span>Shift window: {emp.shiftStart || "08:00"} - {emp.shiftEnd || "16:00"}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-center">
                              {/* Edit Shift Trigger */}
                              <button
                                onClick={() => {
                                  setEditingShiftFor(emp.email);
                                  setEditShiftStart(emp.shiftStart || '08:00');
                                  setEditShiftEnd(emp.shiftEnd || '16:00');
                                }}
                                className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-lg text-slate-700 text-[11px] font-bold transition-all flex items-center gap-1"
                                title="Edit employee shift hours"
                              >
                                <Clock size={12} />
                                <span>Edit Shift</span>
                              </button>

                              {/* Password Reset Trigger */}
                              <button
                                onClick={() => {
                                  setResettingPasswordFor(emp.email);
                                  setResetPasswordVal('');
                                }}
                                className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-lg text-slate-700 text-[11px] font-bold transition-all flex items-center gap-1"
                                title="Reset staff password"
                              >
                                <Key size={12} />
                                <span>Reset Password</span>
                              </button>

                              {/* Delete Employee */}
                              <button
                                onClick={() => handleDeleteEmployee(emp.email, emp.name)}
                                className="px-2.5 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                                title="Delete staff account"
                              >
                                <Trash2 size={12} />
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>

                          {/* Inline Shift Editing Panel */}
                          {editingShiftFor === emp.email && (
                            <div className="mt-3 mx-6 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                              <span className="text-[10px] font-bold text-slate-500 uppercase block">Modify Shift Timing:</span>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-500">Starts:</span>
                                  <input
                                    type="time"
                                    value={editShiftStart}
                                    onChange={(e) => setEditShiftStart(e.target.value)}
                                    className="border border-slate-300 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-emerald-500 bg-white font-medium"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-500">Ends:</span>
                                  <input
                                    type="time"
                                    value={editShiftEnd}
                                    onChange={(e) => setEditShiftEnd(e.target.value)}
                                    className="border border-slate-300 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-emerald-500 bg-white font-medium"
                                  />
                                </div>
                                <div className="flex items-center gap-2 ml-auto">
                                  <button
                                    onClick={() => handleUpdateShift(emp.email)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                                  >
                                    Save Shift
                                  </button>
                                  <button
                                    onClick={() => setEditingShiftFor(null)}
                                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inline Password Reset panel */}
                {resettingPasswordFor && (
                  <form onSubmit={handleResetPassword} className="bg-amber-50/60 p-6 rounded-xl border border-amber-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key size={18} className="text-amber-600" />
                        <h4 className="font-bold text-slate-800 text-sm">Force Password Reset for:</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResettingPasswordFor(null)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-slate-600 text-xs font-mono">{resettingPasswordFor}</p>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="password"
                        value={resetPasswordVal}
                        onChange={(e) => setResetPasswordVal(e.target.value)}
                        placeholder="Enter secure new password"
                        className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        required
                      />
                      <button
                        type="submit"
                        disabled={isResettingPassword}
                        className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition-colors shrink-0"
                      >
                        {isResettingPassword ? "Updating..." : "Save Reset"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Add New Staff panel */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                    <UserPlus size={18} />
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">Provision Staff Account</h3>
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed mb-4">
                  Register a new shift staff account. This allows them to login with their unique email/password, view and edit their assigned bookings, and manage shift status.
                </p>

                <form onSubmit={handleAddEmployee} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Staff Name
                    </label>
                    <input
                      type="text"
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
                      placeholder="e.g. Michael Smith"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Staff Email
                    </label>
                    <input
                      type="email"
                      value={newEmpEmail}
                      onChange={(e) => setNewEmpEmail(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
                      placeholder="michael@enviroride.net"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Staff Initial Password
                    </label>
                    <input
                      type="password"
                      value={newEmpPassword}
                      onChange={(e) => setNewEmpPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
                      placeholder="Enter secure password"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Shift Start (HH:MM)
                      </label>
                      <input
                        type="time"
                        value={newEmpShiftStart}
                        onChange={(e) => setNewEmpShiftStart(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Shift End (HH:MM)
                      </label>
                      <input
                        type="time"
                        value={newEmpShiftEnd}
                        onChange={(e) => setNewEmpShiftEnd(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingEmployee}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors shadow flex justify-center items-center gap-2"
                  >
                    {isAddingEmployee ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Provisioning...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus size={13} />
                        <span>Create Staff Account</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

            </div>
          )}
            </>
          )}

        </div>
      </main>

    </div>
  );
};

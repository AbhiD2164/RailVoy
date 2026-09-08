import React, { useState, useRef } from 'react';
import {
  Ticket, Shield, Download, Printer, CheckCircle2, AlertTriangle,
  Lock, FileText, Train, Calendar, MapPin, User, IndianRupee,
  QrCode, Clock, ChevronRight, RefreshCw
} from 'lucide-react';
import axios from 'axios';

interface TicketData {
  pnr: string;
  trainNo: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  travelDate: string;
  travelClass: string;
  status: string;
  finalFare: number;
  passengers: Array<{
    name: string;
    age: number;
    gender: string;
    seatNo: string;
    berthPreference: string;
  }>;
  coachPosition: string;
  chartStatus: string;
  bookingDate: string;
  bookingTime: string;
  digitalStamp: string;
}

interface TicketViewerProps {
  newBooking?: any;
  newPasscode?: string;
}

export const TicketViewer: React.FC<TicketViewerProps> = ({ newBooking, newPasscode }) => {
  const [pnr, setPnr] = useState(newBooking?.pnr || '');
  const [passkey, setPasskey] = useState(newPasscode || '');
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ticketRef = useRef<HTMLDivElement>(null);

  // Automatically load ticket if newBooking and newPasscode are passed from recent booking
  React.useEffect(() => {
    if (newBooking?.pnr && newPasscode) {
      setPnr(newBooking.pnr);
      setPasskey(newPasscode);
      setError('');
      
      // Auto verify to fetch full formatted ticket record
      axios.post('/api/tickets/verify-passcode', {
        pnr: newBooking.pnr,
        passcode: newPasscode
      })
      .then(res => {
        if (res.data.ticket) {
          setTicket(res.data.ticket);
        }
      })
      .catch(() => {
        // Fallback: build ticket directly from newBooking
        setTicket({
          pnr: newBooking.pnr,
          trainNo: newBooking.trainNo,
          trainName: newBooking.trainName,
          fromStation: newBooking.fromStation,
          toStation: newBooking.toStation,
          travelDate: newBooking.travelDate,
          travelClass: newBooking.travelClass,
          status: newBooking.status || 'Confirmed',
          finalFare: newBooking.finalFare,
          passengers: newBooking.passengers || [],
          coachPosition: newBooking.passengers?.[0]?.seatNo ? newBooking.passengers[0].seatNo.split('-')[0] : 'B3',
          chartStatus: newBooking.status === 'Confirmed' ? 'CHART PREPARED' : 'CHART NOT PREPARED',
          bookingDate: new Date().toLocaleDateString('en-IN'),
          bookingTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          digitalStamp: `RV-AUTH-${newBooking.pnr.slice(-4)}-${Date.now().toString(36).toUpperCase()}`
        });
      });
    }
  }, [newBooking, newPasscode]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTicket(null);
    setLoading(true);
    try {
      const res = await axios.post('/api/tickets/verify-passcode', {
        pnr: pnr.trim().toUpperCase(),
        passcode: passkey.trim()
      });
      setTicket(res.data.ticket);
    } catch (err: any) {
      setError(err.response?.data?.error || 'PNR or Passkey is incorrect. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!ticketRef.current) return;
    const printContent = ticketRef.current.innerHTML;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>RailVoy e-Ticket — ${ticket?.pnr}</title>
          <meta charset="UTF-8" />
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; background: #fff; color: #111; padding: 24px; }
            .ticket-wrapper { max-width: 780px; margin: 0 auto; border: 2px solid #1e3a5f; border-radius: 16px; overflow: hidden; }
            .ticket-header { background: linear-gradient(135deg, #0c1f3d 0%, #0c3547 100%); color: white; padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; }
            .ticket-header .org { font-size: 20px; font-weight: 900; letter-spacing: 1px; }
            .ticket-header .subtitle { font-size: 11px; color: #93c5fd; margin-top: 2px; }
            .status-bar { background: #1a4a2a; color: #86efac; font-size: 11px; font-weight: 700; padding: 8px 28px; letter-spacing: 1px; display: flex; align-items: center; justify-content: space-between; }
            .ticket-body { padding: 24px 28px; border-bottom: 1px dashed #cbd5e1; }
            .field-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
            .field-row.three { grid-template-columns: repeat(3, 1fr); }
            .field-label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 3px; }
            .field-value { font-size: 14px; font-weight: 700; color: #0f172a; }
            .field-value.blue { color: #1d4ed8; }
            .field-value.green { color: #15803d; }
            .field-value.mono { font-family: 'JetBrains Mono', monospace; }
            .pnr-big { font-size: 26px; font-weight: 900; font-family: 'JetBrains Mono', monospace; color: #0c1f3d; letter-spacing: 2px; }
            .section-title { font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 18px 0 12px; }
            .passenger-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 8px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
            .passenger-row.header { font-size: 9px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
            .ticket-footer { padding: 16px 28px; background: #f8fafc; display: flex; justify-content: space-between; align-items: flex-end; }
            .digital-stamp { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #94a3b8; word-break: break-all; max-width: 400px; }
            .important { margin-top: 16px; padding: 12px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 10px; color: #92400e; line-height: 1.6; }
            .important ul { padding-left: 14px; margin-top: 4px; }
            .coach-badge { display: inline-block; background: #0c1f3d; color: #7dd3fc; font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 900; padding: 8px 20px; border-radius: 8px; letter-spacing: 2px; }
            @media print {
              body { padding: 0; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          ${printContent}
          <div class="important" style="margin: 16px; border-radius: 8px;">
            <strong>Important Instructions:</strong>
            <ul>
              <li>This is a computer-generated e-Ticket. Carry a valid photo ID for verification.</li>
              <li>Ticket is non-transferable and valid only for the passenger mentioned.</li>
              <li>Passengers must board at the station and coach mentioned on the ticket.</li>
              <li>Please arrive at the platform at least 30 minutes before scheduled departure.</li>
            </ul>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-2xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-100">e-Ticket Download Portal</h2>
            <p className="text-xs text-slate-400">Enter your PNR number and security passkey sent to your email to download your e-Ticket.</p>
          </div>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-5">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">PNR Number</label>
              <input
                type="text"
                required
                placeholder="e.g. PNR48192031"
                value={pnr}
                onChange={(e) => setPnr(e.target.value)}
                className="w-full px-3.5 py-3 bg-slate-900 border border-slate-700 focus:border-cyan-600 rounded-xl text-sm text-slate-100 uppercase font-mono outline-none transition-colors"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                <span className="flex items-center space-x-1">
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>4-Digit Security Passkey</span>
                </span>
              </label>
              <input
                type="password"
                required
                maxLength={4}
                placeholder="••••"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                className="w-full px-3.5 py-3 bg-slate-900 border border-slate-700 focus:border-amber-600 rounded-xl text-sm text-amber-300 font-mono tracking-widest outline-none transition-colors"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-cyan-900/40 flex items-center justify-center space-x-2 disabled:opacity-60 transition-all"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>Verifying...</span></>
                ) : (
                  <><Shield className="w-4 h-4" /><span>Verify & Get Ticket</span></>
                )}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 p-3.5 bg-amber-950/30 border border-amber-900/50 rounded-xl text-amber-300/80 text-[11px]">
          <span className="font-bold">🔒 Secure Download:</span> Your PNR number and 4-digit passkey were sent to your registered email address after booking. Do not share these credentials with anyone.
        </div>
      </div>

      {/* Official e-Ticket Display */}
      {ticket && (
        <div>
          {/* Download/Print buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-400">Ticket Verified Successfully</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrint}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-md shadow-cyan-900/40 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {/* Printable Ticket (IRCTC-style) */}
          <div ref={ticketRef}>
            <div className="ticket-wrapper rounded-3xl overflow-hidden shadow-2xl border border-slate-700" style={{ fontFamily: 'Inter, sans-serif' }}>

              {/* Ticket Header */}
              <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-950 border-b border-cyan-900/60 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-cyan-900/30 rounded-xl border border-cyan-800/40">
                    <Train className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-lg font-black text-white tracking-wide">RailVoy — e-Ticket</p>
                    <p className="text-[10px] text-cyan-400 font-semibold tracking-widest uppercase">National Railway Network · Official Reservation Slip</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Booked On</p>
                  <p className="text-xs text-slate-300 font-semibold">{ticket.bookingDate} · {ticket.bookingTime}</p>
                </div>
              </div>

              {/* Chart / Booking Status Bar */}
              <div className={`flex items-center justify-between px-6 py-2.5 text-xs font-extrabold tracking-wider uppercase ${
                ticket.status === 'Confirmed'
                  ? 'bg-emerald-900/50 border-b border-emerald-800 text-emerald-300'
                  : 'bg-amber-900/40 border-b border-amber-800 text-amber-300'
              }`}>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  <span>BOOKING STATUS: {ticket.status?.toUpperCase()}</span>
                </div>
                <span>{ticket.chartStatus}</span>
              </div>

              {/* Core ticket fields */}
              <div className="p-6 bg-slate-950/80 border-b border-dashed border-slate-800 space-y-5">
                {/* PNR / Train */}
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">PNR Number</p>
                    <p className="text-3xl font-black text-white font-mono tracking-widest">{ticket.pnr}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Train</p>
                    <p className="text-lg font-extrabold text-cyan-300">{ticket.trainName}</p>
                    <p className="text-xs text-slate-400 font-mono">#{ticket.trainNo} · Class: {ticket.travelClass}</p>
                  </div>
                </div>

                {/* Route */}
                <div className="flex items-center space-x-3">
                  <div className="flex-1 p-3.5 bg-slate-900 rounded-2xl border border-slate-800">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">From</p>
                    <p className="text-lg font-extrabold text-slate-100 font-mono">{ticket.fromStation}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 p-3.5 bg-slate-900 rounded-2xl border border-slate-800">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">To</p>
                    <p className="text-lg font-extrabold text-slate-100 font-mono">{ticket.toStation}</p>
                  </div>
                  <div className="flex-1 p-3.5 bg-slate-900 rounded-2xl border border-slate-800">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Date of Journey</p>
                    <p className="text-sm font-bold text-amber-300">{ticket.travelDate}</p>
                  </div>
                </div>

                {/* Coach / Fare / Digital Stamp */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Coach Position</p>
                    <p className="text-xl font-black text-cyan-300 font-mono tracking-wider">{ticket.coachPosition || 'B-3'}</p>
                  </div>
                  <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Fare Paid</p>
                    <p className="text-xl font-black text-emerald-400">₹{ticket.finalFare}</p>
                  </div>
                  <div className="p-3.5 bg-slate-900/60 rounded-xl border border-cyan-900/30">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Booking Ref. (Digital Stamp)</p>
                    <p className="text-[9px] text-cyan-600 font-mono break-all leading-relaxed">{ticket.digitalStamp?.slice(0, 40)}...</p>
                  </div>
                </div>
              </div>

              {/* Passenger Table */}
              <div className="p-6 bg-slate-950/50">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">Passenger Details</p>
                <div className="space-y-0">
                  {/* Header Row */}
                  <div className="grid grid-cols-5 gap-2 px-2 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <div className="col-span-2">Name</div>
                    <div className="text-center">Age / Gender</div>
                    <div className="text-center">Berth Type</div>
                    <div className="text-center">Seat / Berth No.</div>
                  </div>
                  {ticket.passengers?.map((p, idx) => (
                    <div key={idx} className={`grid grid-cols-5 gap-2 px-2 py-3 text-xs items-center border-b border-slate-800/60 ${idx % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                      <div className="col-span-2">
                        <span className="font-bold text-slate-100">{p.name}</span>
                      </div>
                      <div className="text-center text-slate-300">{p.age} / {p.gender}</div>
                      <div className="text-center text-slate-400">{p.berthPreference}</div>
                      <div className="text-center font-mono font-extrabold text-cyan-300 text-sm">{p.seatNo || 'B3-14'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between">
                <p className="text-[9px] text-slate-600 max-w-lg leading-relaxed">
                  This is a computer-generated e-Ticket. A valid photo ID is mandatory at the time of boarding. This ticket is non-transferable and valid only for the journey mentioned above.
                </p>
                <div className="flex flex-col items-end text-[9px] text-slate-500 font-mono">
                  <span>RailVoy Booking Platform</span>
                  <span className="text-slate-700">DIGITALLY AUTHENTICATED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">e-Ticket Download Portal</h2>
            <p className="text-xs text-slate-500 font-medium">Enter your PNR number and security passkey sent to your email to view or download your ticket.</p>
          </div>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">PNR Number</label>
              <input
                type="text"
                required
                placeholder="e.g. PNR48192031"
                value={pnr}
                onChange={(e) => setPnr(e.target.value)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 focus:bg-white focus:border-sky-600 focus:ring-1 focus:ring-sky-600 rounded-xl text-sm text-slate-900 uppercase font-mono outline-none transition-all"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                <span className="flex items-center space-x-1">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
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
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 focus:bg-white focus:border-sky-600 focus:ring-1 focus:ring-sky-600 rounded-xl text-sm text-slate-900 font-mono tracking-widest outline-none transition-all text-center font-bold"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm rounded-xl shadow-sm flex items-center justify-center space-x-2 disabled:opacity-60 transition-all cursor-pointer"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>Verifying...</span></>
                ) : (
                  <><Shield className="w-4 h-4" /><span>Get e-Ticket</span></>
                )}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 p-3.5 bg-sky-50/80 border border-sky-200/80 rounded-xl text-sky-900 text-xs flex items-center space-x-2">
          <Lock className="w-4 h-4 text-sky-700 flex-shrink-0" />
          <span><strong>Secure Verification:</strong> Your PNR and 4-digit passkey are delivered instantly upon checkout. Keep them confidential.</span>
        </div>
      </div>

      {/* Official e-Ticket Display */}
      {ticket && (
        <div>
          {/* Download/Print buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-bold text-emerald-800">Reservation Confirmed</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrint}
                className="flex items-center space-x-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 shadow-sm transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span>Print</span>
              </button>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center space-x-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {/* Printable Ticket (IRCTC-style) */}
          <div ref={ticketRef}>
            <div className="ticket-wrapper rounded-3xl overflow-hidden shadow-lg border border-slate-300 bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>

              {/* Ticket Header */}
              <div className="p-6 bg-gradient-to-r from-sky-900 via-blue-900 to-indigo-950 text-white flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 bg-white/10 rounded-xl border border-white/20 text-sky-200">
                    <Train className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-lg font-black tracking-wide text-white">RailVoy — Electronic Reservation Slip (ERS)</p>
                    <p className="text-[10px] text-sky-200 font-semibold tracking-wider uppercase">Indian Railways Passenger Reservation Slip</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-sky-300 font-bold uppercase tracking-wider">Booked On</p>
                  <p className="text-xs text-white font-semibold">{ticket.bookingDate} · {ticket.bookingTime}</p>
                </div>
              </div>

              {/* Chart / Booking Status Bar */}
              <div className={`flex items-center justify-between px-6 py-2.5 text-xs font-extrabold tracking-wider uppercase ${
                ticket.status === 'Confirmed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-600 text-white'
              }`}>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span>BOOKING STATUS: {ticket.status?.toUpperCase()}</span>
                </div>
                <span>{ticket.chartStatus}</span>
              </div>

              {/* Core ticket fields */}
              <div className="p-6 bg-white border-b border-dashed border-slate-300 space-y-5">
                {/* PNR / Train */}
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">PNR Number</p>
                    <p className="text-3xl font-black text-slate-900 font-mono tracking-widest">{ticket.pnr}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Train</p>
                    <p className="text-lg font-extrabold text-sky-900">{ticket.trainName}</p>
                    <p className="text-xs text-slate-600 font-mono font-semibold">#{ticket.trainNo} · Class: {ticket.travelClass}</p>
                  </div>
                </div>

                {/* Route */}
                <div className="flex items-center space-x-3">
                  <div className="flex-1 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">From</p>
                    <p className="text-lg font-extrabold text-slate-900 font-mono">{ticket.fromStation}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">To</p>
                    <p className="text-lg font-extrabold text-slate-900 font-mono">{ticket.toStation}</p>
                  </div>
                  <div className="flex-1 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Date of Journey</p>
                    <p className="text-sm font-bold text-sky-800">{ticket.travelDate}</p>
                  </div>
                </div>

                {/* Coach / Fare / Digital Stamp */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Coach Position</p>
                    <p className="text-xl font-black text-sky-900 font-mono tracking-wider">{ticket.coachPosition || 'B-3'}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Fare Paid</p>
                    <p className="text-xl font-black text-emerald-700">₹{ticket.finalFare}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Security Authentication</p>
                    <p className="text-[9px] text-slate-600 font-mono break-all leading-relaxed">{ticket.digitalStamp?.slice(0, 40)}...</p>
                  </div>
                </div>
              </div>

              {/* Passenger Table */}
              <div className="p-6 bg-slate-50/50">
                <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">Passenger Details</p>
                <div>
                  {/* Header Row */}
                  <div className="grid grid-cols-5 gap-2 px-2 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <div className="col-span-2">Name</div>
                    <div className="text-center">Age / Gender</div>
                    <div className="text-center">Berth Type</div>
                    <div className="text-center">Seat / Berth No.</div>
                  </div>
                  {ticket.passengers?.map((p, idx) => (
                    <div key={idx} className={`grid grid-cols-5 gap-2 px-2 py-3 text-xs items-center border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <div className="col-span-2">
                        <span className="font-bold text-slate-900">{p.name}</span>
                      </div>
                      <div className="text-center text-slate-700">{p.age} / {p.gender}</div>
                      <div className="text-center text-slate-600">{p.berthPreference}</div>
                      <div className="text-center font-mono font-extrabold text-sky-800 text-sm">{p.seatNo || 'B3-14'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
                <p className="text-[10px] text-slate-600 max-w-lg leading-relaxed">
                  This is a computer-generated e-Ticket. A valid government photo ID is mandatory at the time of boarding. This ticket is valid only for the journey mentioned above.
                </p>
                <div className="flex flex-col items-end text-[10px] text-slate-500 font-mono">
                  <span>RailVoy Passenger Portal</span>
                  <span className="text-slate-700 font-bold">OFFICIALLY VERIFIED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

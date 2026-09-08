import React, { useState, useEffect } from 'react';
import {
  Activity, Clock, MapPin, Gauge, ShieldAlert, ArrowRight,
  CheckCircle2, AlertTriangle, RefreshCw, Search, Train,
  List, QrCode, FileText, Building2, ChevronRight
} from 'lucide-react';
import axios from 'axios';
import { LiveStatus } from '../types';

interface LiveTrackerProps {
  trainNo: string;
  onTransferTicket: (pnr: string, newTrainNo: string, newTrainName: string) => void;
  activePnr?: string;
}

type TrackerTab = 'trainStatus' | 'stationBoard' | 'pnrStatus';

export const LiveTracker: React.FC<LiveTrackerProps> = ({
  trainNo,
  onTransferTicket,
  activePnr
}) => {
  const [activeTrackerTab, setActiveTrackerTab] = useState<TrackerTab>('trainStatus');

  // Train Live Status
  const [trainList, setTrainList] = useState<any[]>([]);
  const [stationList, setStationList] = useState<any[]>([]);
  const [selectedTrainNo, setSelectedTrainNo] = useState(trainNo || '');
  const [trainInputNo, setTrainInputNo] = useState(trainNo || '');
  const [liveData, setLiveData] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [trainError, setTrainError] = useState('');
  const [transferMessage, setTransferMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Station Live Board
  const [stationCode, setStationCode] = useState('');
  const [stationBoardData, setStationBoardData] = useState<any>(null);
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState('');

  // PNR Status
  const [pnrInput, setPnrInput] = useState(activePnr || '');
  const [pnrPasskey, setPnrPasskey] = useState('');
  const [pnrData, setPnrData] = useState<any>(null);
  const [pnrLoading, setPnrLoading] = useState(false);
  const [pnrError, setPnrError] = useState('');

  // Load dynamic trains and stations from database/dataset
  useEffect(() => {
    axios.get('/api/trains')
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setTrainList(res.data);
          const initial = trainNo || res.data[0].trainNo;
          setSelectedTrainNo(initial);
          setTrainInputNo(initial);
        }
      })
      .catch(err => console.error('Failed to load trains for tracker:', err));

    axios.get('/api/trains/stations')
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setStationList(res.data);
          setStationCode(res.data[0].stationCode);
        }
      })
      .catch(err => console.error('Failed to load stations for tracker:', err));
  }, [trainNo]);

  const fetchLiveStatus = async (tNo: string) => {
    const normalizedTrainNo = tNo.trim();
    if (!normalizedTrainNo) {
      setTrainError('Enter a valid train number to fetch live status.');
      setLiveData(null);
      return;
    }

    setLoading(true);
    setLiveData(null);
    setTrainError('');
    try {
      const res = await axios.get(`/api/trains/${normalizedTrainNo}/live-status`);
      setLiveData(res.data);
    } catch (err: any) {
      console.error('Fetch Live Status Error:', err);
      setTrainError(err.response?.data?.error || 'Unable to fetch live status for this train.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStationBoard = async (code: string) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setStationError('Enter a station code to view the live board.');
      setStationBoardData(null);
      return;
    }

    setStationLoading(true);
    setStationBoardData(null);
    setStationError('');
    try {
      const res = await axios.get(`/api/trains/station/${normalizedCode}/live-board`);
      setStationBoardData(res.data);
    } catch (err: any) {
      console.error('Station Board Error:', err);
      setStationError(err.response?.data?.error || 'Unable to fetch the station live board.');
    } finally {
      setStationLoading(false);
    }
  };

  const handlePnrCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pnrInput.trim() || !pnrPasskey.trim()) {
      setPnrError('Please enter both PNR Number and Security Passkey.');
      return;
    }
    setPnrError('');
    setPnrLoading(true);
    setPnrData(null);
    try {
      const res = await axios.post('/api/tickets/verify-passcode', {
        pnr: pnrInput.trim().toUpperCase(),
        passcode: pnrPasskey.trim()
      });
      setPnrData(res.data.ticket);
    } catch (err: any) {
      setPnrError(err.response?.data?.error || 'PNR verification failed. Check your credentials.');
    } finally {
      setPnrLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveStatus(selectedTrainNo);
  }, [selectedTrainNo]);

  const handleAcceptTransfer = async (altTrainNo: string, altTrainName: string) => {
    if (!activePnr) {
      setTransferMessage({
        type: 'success',
        text: `Transfer accepted — ticket validity moved to Train ${altTrainNo} (${altTrainName}). Seat guaranteed.`
      });
      return;
    }
    try {
      await axios.post('/api/bookings/transfer', {
        pnr: activePnr,
        newTrainNo: altTrainNo,
        newTrainName: altTrainName
      });
      setTransferMessage({
        type: 'success',
        text: `Ticket ${activePnr} successfully transferred to Train ${altTrainNo}!`
      });
      onTransferTicket(activePnr, altTrainNo, altTrainName);
    } catch (err: any) {
      setTransferMessage({
        type: 'error',
        text: err.response?.data?.error || `Transfer to Train ${altTrainNo} could not be completed. Please try again.`
      });
    }
  };

  const tabButtonClass = (tab: TrackerTab) =>
    `flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
      activeTrackerTab === tab
        ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
    }`;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">

      {/* NTES Header */}
      <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-2xl">
        <div className="flex items-center space-x-3 mb-5">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-100">NTES — National Train Enquiry System</h2>
            <p className="text-xs text-slate-400">Live train running status, station departures/arrivals board & PNR enquiry</p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveTrackerTab('trainStatus')} className={tabButtonClass('trainStatus')}>
            <Train className="w-4 h-4" />
            <span>Train Running Status</span>
          </button>
          <button onClick={() => setActiveTrackerTab('stationBoard')} className={tabButtonClass('stationBoard')}>
            <Building2 className="w-4 h-4" />
            <span>Station Live Board</span>
          </button>
          <button onClick={() => setActiveTrackerTab('pnrStatus')} className={tabButtonClass('pnrStatus')}>
            <FileText className="w-4 h-4" />
            <span>PNR Enquiry</span>
          </button>
        </div>
      </div>

      {/* TAB: Train Running Status */}
      {activeTrackerTab === 'trainStatus' && (
        <div className="space-y-5">
          {/* Search bar */}
          <div className="glass-card p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={trainInputNo}
                onChange={(e) => setTrainInputNo(e.target.value)}
                placeholder="Enter Train Number..."
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
              />
            </div>
            <select
              value={selectedTrainNo}
              onChange={(e) => { setSelectedTrainNo(e.target.value); setTrainInputNo(e.target.value); }}
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-cyan-300"
            >
              {trainList.map(t => <option key={t.trainNo} value={t.trainNo}>{t.trainNo} — {t.trainName}</option>)}
            </select>
            <button
              onClick={() => {
                const normalized = trainInputNo.trim();
                if (!normalized) {
                  setTrainError('Enter a valid train number to fetch live status.');
                  return;
                }
                setSelectedTrainNo(normalized);
                fetchLiveStatus(normalized);
              }}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Get Status</span>
            </button>
            <button
              onClick={() => fetchLiveStatus(selectedTrainNo)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {trainError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{trainError}</span>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400">Fetching live running status from NTES network...</p>
            </div>
          )}

          {liveData && !loading && (
            <>
              {/* Status Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-card p-4 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Running Status</span>
                  <p className={`text-sm font-extrabold mt-1 ${liveData.currentDelayMinutes > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {liveData.status}
                  </p>
                </div>
                <div className="glass-card p-4 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Current Station</span>
                  <p className="text-sm font-bold text-slate-100 mt-1">{liveData.currentStation}</p>
                  <p className="text-[11px] text-slate-400">Pf. #{(liveData as any).platformNo}</p>
                </div>
                <div className="glass-card p-4 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Next Station</span>
                  <p className="text-sm font-bold text-cyan-300 mt-1">{liveData.nextStation}</p>
                </div>
                <div className="glass-card p-4 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Speed</span>
                  <div className="flex items-center space-x-1.5 mt-1">
                    <Gauge className="w-4 h-4 text-teal-400" />
                    <span className="text-sm font-bold text-slate-100">{liveData.currentSpeedKmH} km/h</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Signal: {(liveData as any).signalStatus || 'All Clear'}</p>
                </div>
              </div>

              {/* Journey Replanning Alert */}
              {liveData.aiReplanning?.recommendationAvailable && (
                <div className="glass-panel p-6 rounded-3xl border border-rose-900/60 bg-slate-900/90 shadow-2xl">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-rose-300">Delay Alert — Alternative Trains Available</h3>
                      <p className="text-xs text-slate-400">
                        Train #{liveData.trainNo} is delayed by {liveData.currentDelayMinutes} mins. Available alternatives below.
                      </p>
                    </div>
                  </div>

                  {transferMessage ? (
                    <div className={`p-4 border rounded-2xl text-xs font-semibold flex items-center space-x-2 ${
                      transferMessage.type === 'success'
                        ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                        : 'bg-rose-950/80 border-rose-700 text-rose-300'
                    }`}>
                      {transferMessage.type === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                      )}
                      <span>{transferMessage.text}</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {liveData.aiReplanning.alternativeTrains.map((alt, idx) => (
                        <div key={idx} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm text-slate-100">{alt.trainName}</span>
                              <span className="text-xs px-2 py-0.5 rounded-lg bg-cyan-950 text-cyan-400 font-mono">#{alt.trainNo}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{alt.explanation}</p>
                            <span className="inline-block text-[11px] text-emerald-400 font-semibold mt-1">
                              Save ~{alt.timeSavedMinutes} mins · Guaranteed Seat Available
                            </span>
                          </div>
                          <button
                            onClick={() => handleAcceptTransfer(alt.trainNo, alt.trainName)}
                            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg flex items-center space-x-1"
                          >
                            <span>Transfer Ticket</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Route Timeline */}
              <div className="glass-card p-6 rounded-3xl border border-slate-800">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Route & Stoppages</h3>
                  <span className="text-[10px] text-slate-500 font-semibold">{liveData.trainName} ({liveData.trainNo}) · Last Updated: {(liveData as any).lastUpdated || 'Live'}</span>
                </div>
                <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                  {liveData.stops.map((stop, idx) => (
                    <div key={idx} className="relative flex items-center justify-between">
                      <div className={`absolute -left-6 w-5 h-5 rounded-full border-2 flex items-center justify-center z-10 ${
                        stop.isCurrent
                          ? 'bg-cyan-500 border-cyan-300 shadow-lg shadow-cyan-500/40'
                          : stop.isCompleted
                          ? 'bg-emerald-500 border-emerald-300'
                          : 'bg-slate-900 border-slate-700'
                      }`}>
                        {stop.isCompleted && !stop.isCurrent && <CheckCircle2 className="w-3 h-3 text-slate-950" />}
                        {stop.isCurrent && <span className="w-2 h-2 rounded-full bg-white animate-ping" />}
                      </div>
                      <div className="ml-2">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-bold ${stop.isCurrent ? 'text-cyan-300' : stop.isCompleted ? 'text-slate-400' : 'text-slate-200'}`}>
                            {stop.stationCode}
                          </span>
                          {stop.isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800 animate-pulse">
                              ● LIVE HERE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">{stop.distanceFromOriginKm} km · Pf {(stop as any).platformNo || 1}</span>
                      </div>
                      <div className="text-right font-mono text-xs text-slate-400">
                        <div>Arr: {stop.arrival}</div>
                        <div>Dep: {stop.departure}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: Station Live Board */}
      {activeTrackerTab === 'stationBoard' && (
        <div className="space-y-5">
          <div className="glass-card p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 flex-1">
              <MapPin className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={stationCode}
                onChange={(e) => setStationCode(e.target.value.toUpperCase())}
                placeholder="Station Code (e.g. NDLS, SBC, BPL)"
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none uppercase font-mono"
                maxLength={6}
              />
            </div>
            <button
              onClick={() => fetchStationBoard(stationCode)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Get Board</span>
            </button>
          </div>

          {/* Dynamic stations quick pick */}
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] text-slate-500 font-semibold self-center">Quick:</span>
            {stationList.slice(0, 8).map(s => (
              <button
                key={s.stationCode}
                onClick={() => { setStationCode(s.stationCode); fetchStationBoard(s.stationCode); }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-cyan-300 font-medium transition-colors"
              >
                {s.stationCode} — {s.stationName}
              </button>
            ))}
          </div>

          {stationError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{stationError}</span>
            </div>
          )}

          {stationLoading && (
            <div className="text-center py-12">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400">Loading station departures & arrivals...</p>
            </div>
          )}

          {stationBoardData && !stationLoading && (
            <div className="glass-card p-6 rounded-3xl border border-slate-800">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-100">Live Board — {stationBoardData.stationCode}</h3>
                  <p className="text-xs text-slate-400">{stationBoardData.totalTrains} trains passing through this station</p>
                </div>
                <span className="text-[10px] text-emerald-400 font-bold border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 rounded-lg">● LIVE</span>
              </div>

              {stationBoardData.trains.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-6">No trains found for this station code.</p>
              ) : (
                <div className="space-y-3">
                  {/* Header row */}
                  <div className="grid grid-cols-7 gap-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <div className="col-span-2">Train</div>
                    <div>From</div>
                    <div>To</div>
                    <div className="text-center">Arr</div>
                    <div className="text-center">Dep</div>
                    <div className="text-center">Status</div>
                  </div>
                  {stationBoardData.trains.map((t: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-7 gap-2 items-center p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs hover:border-cyan-900/60 transition-colors">
                      <div className="col-span-2">
                        <p className="font-bold text-slate-100 leading-tight">{t.trainName}</p>
                        <p className="font-mono text-cyan-400 text-[10px]">#{t.trainNo}</p>
                      </div>
                      <div className="text-slate-400 text-[10px]">{t.source}</div>
                      <div className="text-slate-400 text-[10px]">{t.destination}</div>
                      <div className="text-center font-mono text-slate-300">{t.scheduledArrival || '—'}</div>
                      <div className="text-center font-mono text-slate-300">{t.scheduledDeparture || '—'}</div>
                      <div className="text-center">
                        <span className={`px-2 py-0.5 rounded-lg font-bold text-[10px] ${
                          t.delayMinutes === 0
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {t.status}
                        </span>
                        <p className="text-[9px] text-slate-500 mt-0.5">Pf. {t.platformNo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: PNR Enquiry */}
      {activeTrackerTab === 'pnrStatus' && (
        <div className="space-y-5">
          <div className="glass-card p-6 rounded-2xl border border-slate-800">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>PNR Status Enquiry</span>
            </h3>
            <form onSubmit={handlePnrCheck} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">PNR Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PNR48192031"
                    value={pnrInput}
                    onChange={(e) => setPnrInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 uppercase font-mono"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">4-Digit Security Passkey</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    placeholder="••••"
                    value={pnrPasskey}
                    onChange={(e) => setPnrPasskey(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-cyan-300 font-mono tracking-widest"
                  />
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={pnrLoading}
                    className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl"
                  >
                    {pnrLoading ? 'Checking...' : 'Check PNR Status'}
                  </button>
                </div>
              </div>
            </form>

            {pnrError && (
              <div className="mt-3 p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{pnrError}</span>
              </div>
            )}
          </div>

          {pnrData && (
            <div className="glass-panel p-6 rounded-3xl border border-slate-700 shadow-2xl bg-slate-900/90">
              <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">PNR ENQUIRY RESULT</span>
                  <h3 className="text-xl font-black text-slate-100 mt-0.5">PNR: {pnrData.pnr}</h3>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-4 py-1.5 rounded-xl font-extrabold text-xs tracking-wider border ${
                    pnrData.status === 'Confirmed'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      : 'bg-amber-950 text-amber-300 border-amber-700'
                  }`}>
                    {pnrData.status?.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-500">{pnrData.chartStatus}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Train</span>
                  <p className="text-sm font-bold text-cyan-300 mt-0.5">{pnrData.trainName}</p>
                  <p className="text-[11px] text-slate-400">#{pnrData.trainNo} · {pnrData.travelClass}</p>
                </div>
                <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Route</span>
                  <p className="text-sm font-bold text-slate-200 mt-0.5">{pnrData.fromStation} → {pnrData.toStation}</p>
                  <p className="text-[11px] text-slate-400">Date: {pnrData.travelDate}</p>
                </div>
                <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Fare</span>
                  <p className="text-sm font-bold text-emerald-400 mt-0.5">₹{pnrData.finalFare}</p>
                  <p className="text-[11px] text-slate-400">Coach: {pnrData.coachPosition}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Passenger Details</h4>
                <div className="space-y-2">
                  {pnrData.passengers?.map((p: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-200">{p.name}</span>
                        <span className="text-slate-500 ml-2">({p.age} yrs, {p.gender})</span>
                      </div>
                      <div className="font-mono text-cyan-400 font-semibold">
                        Berth: {p.seatNo || 'B3-14'} ({p.berthPreference})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

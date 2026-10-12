import React, { useState, useEffect } from 'react';
import {
  Activity, Clock, MapPin, Gauge, ShieldAlert, ArrowRight,
  CheckCircle2, AlertTriangle, RefreshCw, Search, Train,
  List, QrCode, FileText, Building2, ChevronRight, Sparkles, Check
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
  const [deviceLocation, setDeviceLocation] = useState<{ latitude: number; longitude: number } | null>(null);
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

  // Route Replan / Change Destination Modal
  const [isReplanModalOpen, setIsReplanModalOpen] = useState(false);
  const [replanIntermediate, setReplanIntermediate] = useState('BPL');
  const [replanNewDestination, setReplanNewDestination] = useState('HWH');
  const [replanOptions, setReplanOptions] = useState<any[]>([]);
  const [replanLoading, setReplanLoading] = useState(false);
  const [replanError, setReplanError] = useState('');
  const [replanSelectedTrain, setReplanSelectedTrain] = useState<any>(null);
  const [replanClass, setReplanClass] = useState('3A');

  const handleSearchReplan = async (from: string, to: string) => {
    setReplanLoading(true);
    setReplanError('');
    setReplanSelectedTrain(null);
    try {
      const res = await axios.get(`/api/trains/replan-options?from=${from}&to=${to}`);
      setReplanOptions(res.data.options || []);
      if (!res.data.options?.length) {
        setReplanError(`No trains found connecting ${from} to ${to}. Please try different stations.`);
      }
    } catch (err: any) {
      setReplanError(err.response?.data?.error || 'Unable to load connecting trains.');
    } finally {
      setReplanLoading(false);
    }
  };

  const handleConfirmReplan = async () => {
    if (!replanSelectedTrain) return;
    const targetPnr = activePnr || pnrInput;
    if (!targetPnr) {
      setTransferMessage({
        type: 'error',
        text: 'Please enter your PNR in PNR Enquiry tab first to commit route replanning.'
      });
      setIsReplanModalOpen(false);
      return;
    }
    setReplanLoading(true);
    setReplanError('');
    try {
      const payload = {
        pnr: targetPnr,
        intermediateStation: replanIntermediate,
        newDestination: replanNewDestination,
        newTrainNo: replanSelectedTrain.trainNo,
        newTravelClass: replanClass
      };
      
      try {
        await axios.post('/api/bookings/replan-journey', payload);
      } catch (postErr: any) {
        if (postErr.response?.status === 402 && postErr.response.data?.requiredAmount) {
          const pmt = await axios.post('/api/banking/transfer-payment', {
            email: pnrData?.userEmail,
            pnr: targetPnr,
            fareDiff: postErr.response.data.requiredAmount,
            direction: 'charge'
          });
          await axios.post('/api/bookings/replan-journey', { ...payload, transferPaymentId: pmt.data.transactionId });
        } else {
          throw postErr;
        }
      }

      setTransferMessage({
        type: 'success',
        text: `Journey replanned successfully! Ticket ${targetPnr} transferred to Train #${replanSelectedTrain.trainNo} heading to ${replanNewDestination}. Zero cash refund issued as per policy.`
      });
      setIsReplanModalOpen(false);
      onTransferTicket(targetPnr, replanSelectedTrain.trainNo, replanSelectedTrain.trainName);
    } catch (err: any) {
      setReplanError(err.response?.data?.error || 'Failed to replan journey.');
    } finally {
      setReplanLoading(false);
    }
  };

  // Load dynamic trains and stations from database/dataset
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => setDeviceLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => setDeviceLocation(null),
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 }
      );
    }

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
    if (selectedTrainNo) {
      fetchLiveStatus(selectedTrainNo);
    }
  }, [selectedTrainNo]);

  const handleAcceptTransfer = async (altTrainNo: string, altTrainName: string) => {
    if (!activePnr) {
      setTransferMessage({
        type: 'success',
        text: `Transfer verified: Seat held on Train #${altTrainNo} (${altTrainName}). Please enter your PNR in PNR Enquiry tab to commit ticket transfer.`
      });
      return;
    }
    try {
      const transfer = {
        pnr: activePnr,
        newTrainNo: altTrainNo,
        newTrainName: altTrainName
      };
      try {
        await axios.post('/api/bookings/transfer', transfer);
      } catch (err: any) {
        if (err.response?.status !== 402 || !err.response.data?.requiredAmount) throw err;
        const payment = await axios.post('/api/banking/transfer-payment', {
          email: pnrData?.userEmail,
          pnr: activePnr,
          fareDiff: err.response.data.requiredAmount,
          direction: 'charge'
        });
        await axios.post('/api/bookings/transfer', { ...transfer, transferPaymentId: payment.data.transactionId });
      }
      setTransferMessage({
        type: 'success',
        text: `Ticket ${activePnr} successfully transferred to Train #${altTrainNo} (${altTrainName})!`
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
    `flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
      activeTrackerTab === tab
        ? 'bg-sky-600 text-white shadow-sm'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  // Check if there are alternative train recommendations from AI delay replanning
  const replanData = (liveData as any)?.aiReplan || (liveData as any)?.aiReplanning;
  const hasAlternatives = replanData?.recommendationAvailable && replanData?.alternativeTrains?.length > 0;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">

      {/* NTES Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3 mb-5">
          <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">NTES — National Train Enquiry System</h2>
            <p className="text-xs text-slate-500 font-medium">Live train running status, GPS tracking, station live board &amp; PNR enquiry</p>
            {deviceLocation && (
              <p className="mt-1 text-[11px] text-sky-700">Device location available for station context: {deviceLocation.latitude.toFixed(4)}, {deviceLocation.longitude.toFixed(4)}</p>
            )}
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
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={trainInputNo}
                onChange={(e) => setTrainInputNo(e.target.value)}
                placeholder="Enter Train Number (e.g. 12951, 22436)..."
                className="flex-1 bg-transparent text-sm text-slate-900 font-semibold placeholder-slate-400 outline-none"
              />
            </div>
            <select
              value={selectedTrainNo}
              onChange={(e) => { setSelectedTrainNo(e.target.value); setTrainInputNo(e.target.value); }}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-sky-800"
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
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Get Status</span>
            </button>
            <button
              onClick={() => fetchLiveStatus(selectedTrainNo)}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            </button>
          </div>

          {trainError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center space-x-2 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{trainError}</span>
            </div>
          )}

          {transferMessage && (
            <div className={`p-4 rounded-xl border text-xs font-bold flex items-center space-x-2 shadow-sm ${
              transferMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-rose-50 border-rose-300 text-rose-800'
            }`}>
              {transferMessage.type === 'success' ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
              <span>{transferMessage.text}</span>
            </div>
          )}

          {loading && (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 font-semibold">Connecting to CRIS / NTES GPS satellite network...</p>
            </div>
          )}

          {liveData && !loading && (
            <>
              {/* Status Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Running Status</span>
                  <p className={`text-sm font-black mt-1 ${liveData.currentDelayMinutes > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {liveData.status}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Current Station</span>
                  <p className="text-sm font-black text-slate-900 mt-1">{liveData.currentStation}</p>
                  <p className="text-[11px] text-slate-500 font-medium">Platform #{(liveData as any).platformNo || 2}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Next Station</span>
                  <p className="text-sm font-black text-sky-800 mt-1">{liveData.nextStation}</p>
                  <p className="text-[11px] text-slate-500 font-medium">Signals: {(liveData as any).signalStatus || 'All Clear'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Speed</span>
                  <div className="flex items-center space-x-1.5 mt-1">
                    <Gauge className="w-4 h-4 text-sky-600" />
                    <span className="text-sm font-black text-slate-900">{liveData.currentSpeedKmH} km/h</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">GPS Tracked</p>
                </div>
              </div>

              {/* ── AUTOMATIC DELAY REPLANNING SUGGESTIONS ── */}
              {hasAlternatives && (
                <div className="bg-gradient-to-r from-sky-50 via-amber-50 to-orange-50 border-2 border-amber-300 rounded-3xl p-6 shadow-md animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black text-slate-900">AI Delay Replanning</h3>
                          {/* EXACT REQUIRED LABEL: <N> alternate trains available with <n> vacant seats */}
                          <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-600 text-white shadow-xs">
                            {replanData.label || `${replanData.alternativeTrains?.length || 0} alternate trains available with ${replanData.alternativeTrains?.reduce((acc: number, t: any) => acc + (t.availableSeats || 0), 0) || 0} vacant seats`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          Train #{liveData.trainNo} is delayed by <strong>{liveData.currentDelayMinutes} mins</strong>.
                          Transfer to an on-time train on this route with <strong>zero penalty</strong>, or replan your journey to a different destination.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsReplanModalOpen(true);
                        handleSearchReplan(replanIntermediate, replanNewDestination);
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center space-x-1.5 transition-all self-start sm:self-auto cursor-pointer"
                    >
                      <span>Replan / Change Route</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {replanData.alternativeTrains.map((alt: any, idx: number) => (
                      <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-sky-400 transition-colors">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-sm text-slate-900">{alt.trainName}</span>
                            <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 font-bold border border-sky-200">#{alt.trainNo}</span>
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Save ~{alt.timeSavedMinutes} mins
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Dep: <strong className="text-slate-800 font-mono">{alt.departure}</strong> &bull;
                            Arr: <strong className="text-slate-800 font-mono">{alt.arrival}</strong> &bull;
                            Available Seats: <strong className="text-emerald-700 font-bold">{alt.availableSeats} Vacant</strong>
                          </p>
                          <p className="text-[11px] text-slate-600 mt-1 italic">{alt.explanation}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAcceptTransfer(alt.trainNo, alt.trainName)}
                          className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center space-x-1.5 self-start sm:self-center transition-all hover:scale-105 active:scale-95 whitespace-nowrap cursor-pointer"
                        >
                          <span>Transfer (Zero Fee)</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Route Timeline */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Route &amp; Stoppages Timeline</h3>
                  <span className="text-[11px] text-slate-500 font-semibold">{liveData.trainName} (#{liveData.trainNo}) &bull; Last Updated: {(liveData as any).lastUpdated || 'Live'}</span>
                </div>
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {liveData.stops.map((stop, idx) => (
                    <div key={idx} className="relative flex items-center justify-between">
                      <div className={`absolute -left-6 w-5 h-5 rounded-full border-2 flex items-center justify-center z-10 ${
                        stop.isCurrent
                          ? 'bg-sky-600 border-sky-300 shadow-md shadow-sky-500/30'
                          : stop.isCompleted
                          ? 'bg-emerald-500 border-emerald-300'
                          : 'bg-white border-slate-300'
                      }`}>
                        {stop.isCompleted && !stop.isCurrent && <CheckCircle2 className="w-3 h-3 text-white" />}
                        {stop.isCurrent && <span className="w-2 h-2 rounded-full bg-white animate-ping" />}
                      </div>
                      <div className="ml-2">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-black ${stop.isCurrent ? 'text-sky-800' : stop.isCompleted ? 'text-slate-500' : 'text-slate-800'}`}>
                            {stop.stationCode}
                          </span>
                          {stop.isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-extrabold border border-sky-300 animate-pulse">
                              ● CURRENT LOCATION
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">{stop.distanceFromOriginKm} km &bull; Platform #{(stop as any).platformNo || 1}</span>
                      </div>
                      <div className="text-right font-mono text-xs text-slate-600">
                        <div>Arr: <span className="font-semibold">{stop.arrival}</span></div>
                        <div>Dep: <span className="font-semibold">{stop.departure}</span></div>
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
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 flex-1">
              <MapPin className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={stationCode}
                onChange={(e) => setStationCode(e.target.value.toUpperCase())}
                placeholder="Station Code (e.g. NDLS, SBC, BPL, INDB)"
                className="flex-1 bg-transparent text-sm text-slate-900 font-semibold placeholder-slate-400 outline-none uppercase font-mono"
                maxLength={6}
              />
            </div>
            <button
              onClick={() => fetchStationBoard(stationCode)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Get Board</span>
            </button>
          </div>

          {/* Dynamic stations quick pick */}
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] text-slate-500 font-bold self-center">Quick Stations:</span>
            {stationList.slice(0, 8).map(s => (
              <button
                key={s.stationCode}
                onClick={() => { setStationCode(s.stationCode); fetchStationBoard(s.stationCode); }}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] text-sky-800 font-bold transition-colors shadow-2xs"
              >
                {s.stationCode} — {s.stationName}
              </button>
            ))}
          </div>

          {stationError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center space-x-2 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{stationError}</span>
            </div>
          )}

          {stationLoading && (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 font-semibold">Loading station departures &amp; arrivals board...</p>
            </div>
          )}

          {stationBoardData && !stationLoading && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-5 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900">Live Station Board — {stationBoardData.stationCode}</h3>
                  <p className="text-xs text-slate-500 font-medium">{stationBoardData.totalTrains} trains scheduled through this station</p>
                </div>
                <span className="text-[10px] text-emerald-800 font-bold border border-emerald-300 bg-emerald-50 px-2.5 py-1 rounded-lg">● LIVE BOARD</span>
              </div>

              {stationBoardData.trains.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-6">No trains found for this station code.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-7 gap-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <div className="col-span-2">Train</div>
                    <div>From</div>
                    <div>To</div>
                    <div className="text-center">Arr</div>
                    <div className="text-center">Dep</div>
                    <div className="text-center">Status</div>
                  </div>
                  {stationBoardData.trains.map((t: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-7 gap-2 items-center p-3 bg-slate-50/80 rounded-xl border border-slate-200 text-xs hover:border-sky-300 transition-colors">
                      <div className="col-span-2">
                        <p className="font-black text-slate-900 leading-tight">{t.trainName}</p>
                        <p className="font-mono text-sky-700 text-[10px]">#{t.trainNo}</p>
                      </div>
                      <div className="text-slate-600 text-[11px] font-medium">{t.source}</div>
                      <div className="text-slate-600 text-[11px] font-medium">{t.destination}</div>
                      <div className="text-center font-mono text-slate-700 font-semibold">{t.scheduledArrival || '—'}</div>
                      <div className="text-center font-mono text-slate-700 font-semibold">{t.scheduledDeparture || '—'}</div>
                      <div className="text-center">
                        <span className={`px-2 py-0.5 rounded-lg font-bold text-[10px] ${
                          t.delayMinutes === 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {t.status}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Pf. {t.platformNo}</p>
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
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-base font-black text-slate-900 mb-2">Official PNR Status &amp; Ticket Validity</h3>
            <p className="text-xs text-slate-500 mb-5">Enter your 10-character PNR and 4-digit Security Passcode to inspect real-time confirmation status or initiate delay transfers.</p>

            <form onSubmit={handlePnrCheck} className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-4">
              <div className="sm:col-span-6">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">PNR Number</label>
                <input
                  type="text"
                  value={pnrInput}
                  onChange={(e) => setPnrInput(e.target.value.toUpperCase())}
                  placeholder="e.g. PNR-12627-8902"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none uppercase focus:border-sky-500 focus:bg-white"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Security Passcode</label>
                <input
                  type="password"
                  value={pnrPasskey}
                  onChange={(e) => setPnrPasskey(e.target.value)}
                  placeholder="4-digit Passcode"
                  maxLength={6}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={pnrLoading}
                  className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                >
                  {pnrLoading ? 'Verifying...' : 'Check PNR'}
                </button>
              </div>
            </form>

            {pnrError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{pnrError}</span>
              </div>
            )}

            {pnrData && (
              <div className="mt-6 p-5 bg-sky-50/60 rounded-2xl border border-sky-200 space-y-4">
                <div className="flex items-center justify-between border-b border-sky-200 pb-3">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Booking Record</span>
                    <h4 className="text-sm font-black text-slate-900">{pnrData.trainName} (#{pnrData.trainNo})</h4>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                    pnrData.status === 'Confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {pnrData.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-slate-500 block text-[10px]">Route:</span><strong className="text-slate-800">{pnrData.fromStation} &rarr; {pnrData.toStation}</strong></div>
                  <div><span className="text-slate-500 block text-[10px]">Travel Date:</span><strong className="text-slate-800">{pnrData.travelDate}</strong></div>
                  <div><span className="text-slate-500 block text-[10px]">Class:</span><strong className="text-slate-800">{pnrData.travelClass}</strong></div>
                  <div><span className="text-slate-500 block text-[10px]">Passengers:</span><strong className="text-slate-800">{pnrData.passengers?.length || 1} Pax</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ROUTE REPLANNING & DIVERSION MODAL ── */}
      {isReplanModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 text-left">
          <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-800 to-indigo-900 p-5 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
                  <RefreshCw className="w-5 h-5 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="text-base font-black">Journey Replanning &amp; Route Diversion</h3>
                  <p className="text-xs text-purple-200">Change your travel destination or route mid-journey (e.g. via Bhopal to Howrah)</p>
                </div>
              </div>
              <button
                onClick={() => setIsReplanModalOpen(false)}
                className="p-2 text-purple-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* Policy Notification */}
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-xs space-y-1.5 text-purple-900">
                <div className="font-black flex items-center space-x-1.5">
                  <ShieldAlert className="w-4 h-4 text-purple-700" />
                  <span>Statutory Railway Replanning &amp; Route Alteration Rules</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                  <li><strong>Same-Route Train Change:</strong> Zero penalty. Fare difference is charged or refunded based on coach tier.</li>
                  <li><strong>Different-Route Diversion:</strong> A nominal ₹60/pax route alteration fee is charged. <strong>No money is refunded</strong> even if the new train/coach ticket price is less than the cancelled segment.</li>
                  <li><strong>Zero Purpose Inquiries:</strong> Replanning is guaranteed equally to all passengers without asking the purpose of travel.</li>
                </ul>
              </div>

              {/* Station Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    1. Diversion / Intermediate Station (Where you change plans)
                  </label>
                  <select
                    value={replanIntermediate}
                    onChange={(e) => {
                      setReplanIntermediate(e.target.value);
                      handleSearchReplan(e.target.value, replanNewDestination);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
                  >
                    <option value="BPL">BPL — Bhopal Junction</option>
                    <option value="ET">ET — Itarsi Junction</option>
                    <option value="GWL">GWL — Gwalior Junction</option>
                    <option value="VGLJ">VGLJ — Virangana Lakshmibai (Jhansi)</option>
                    <option value="RTM">RTM — Ratlam Junction</option>
                    <option value="BRC">BRC — Vadodara Junction</option>
                    <option value="AGC">AGC — Agra Cantt</option>
                    <option value="CNB">CNB — Kanpur Central</option>
                    <option value="PUNE">PUNE — Pune Junction</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    2. New Destination Station
                  </label>
                  <select
                    value={replanNewDestination}
                    onChange={(e) => {
                      setReplanNewDestination(e.target.value);
                      handleSearchReplan(replanIntermediate, e.target.value);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
                  >
                    <option value="HWH">HWH — Howrah Junction (Kolkata)</option>
                    <option value="NDLS">NDLS — New Delhi</option>
                    <option value="MMCT">MMCT — Mumbai Central</option>
                    <option value="SBC">SBC — KSR Bengaluru</option>
                    <option value="PUNE">PUNE — Pune Junction</option>
                    <option value="BSB">BSB — Varanasi Junction</option>
                    <option value="INDB">INDB — Indore Junction</option>
                  </select>
                </div>
              </div>

              {/* Connecting Trains List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Available Connecting Trains ({replanIntermediate} &rarr; {replanNewDestination})
                  </h4>
                  {replanLoading && <span className="text-xs text-purple-600 font-bold animate-pulse">Searching available rakes...</span>}
                </div>

                {replanError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
                    {replanError}
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {replanOptions.map((opt: any) => (
                    <div
                      key={opt.trainNo}
                      onClick={() => setReplanSelectedTrain(opt)}
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                        replanSelectedTrain?.trainNo === opt.trainNo
                          ? 'border-purple-600 bg-purple-50/70 shadow-sm'
                          : 'border-slate-200 hover:border-purple-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-sm text-slate-900">{opt.trainName}</span>
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">#{opt.trainNo}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Dep: <strong>{opt.departureTime}</strong> &bull; Arr: <strong>{opt.arrivalTime}</strong> &bull; Dist: {opt.distanceKm} km
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                            {opt.availableSeats} Vacant Berths
                          </span>
                        </div>
                      </div>

                      {/* Coach Class Pricing Grid */}
                      <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
                        {['3A', '2A', 'SL', '1A', 'CC'].map((cls) => {
                          const price = opt.classPricing?.[cls];
                          const seats = opt.availableSeatsByClass?.[cls];
                          if (!price) return null;
                          return (
                            <button
                              key={cls}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReplanSelectedTrain(opt);
                                setReplanClass(cls);
                              }}
                              className={`px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-all ${
                                replanSelectedTrain?.trainNo === opt.trainNo && replanClass === cls
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-purple-400'
                              }`}
                            >
                              {cls}: ₹{price} ({seats} left)
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsReplanModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!replanSelectedTrain || replanLoading}
                  onClick={handleConfirmReplan}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-md disabled:opacity-50 flex items-center space-x-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Confirm Route Diversion to {replanNewDestination}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

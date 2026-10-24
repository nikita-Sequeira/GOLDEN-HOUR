import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, MapPin, X, AlertCircle, Send, Clock3 } from 'lucide-react';
import { Hospital, PatientInfo } from '../../../types/bedlink';
import { Translations } from '../../../i18n/translations';

interface MultiHospitalHoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientInfo: PatientInfo;
  slaSeconds: number;
  formatTimer: (secs: number) => string;
  selectedPaymentMode: 'Cashless Insurance / PM-JAY' | 'Self-Pay / Cash';
  setSelectedPaymentMode: (mode: 'Cashless Insurance / PM-JAY' | 'Self-Pay / Cash') => void;
  rankedHospitals: Hospital[];
  onSelectFinalHospital: (hospital: Hospital, bay: string) => Promise<void>;
  holdError?: string | null;
  isHolding?: boolean;
  t: Translations;
}

export const MultiHospitalHoldModal: React.FC<MultiHospitalHoldModalProps> = ({
  isOpen,
  onClose,
  patientInfo,
  slaSeconds,
  formatTimer,
  selectedPaymentMode,
  setSelectedPaymentMode,
  rankedHospitals,
  onSelectFinalHospital,
  holdError,
  isHolding = false,
  t,
}) => {
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'collecting'>('idle');
  const [acceptedCount, setAcceptedCount] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setRequestState('idle');
      setAcceptedCount(0);
    }
  }, [isOpen]);

  const sendRequestsToAllHospitals = () => {
    setRequestState('sending');
    setAcceptedCount(0);
    window.setTimeout(() => setRequestState('collecting'), 350);
    window.setTimeout(() => setAcceptedCount(1), 900);
    window.setTimeout(() => setAcceptedCount(2), 1500);
    window.setTimeout(() => setAcceptedCount(3), 2100);
  };

  if (!isOpen) return null;

  const isExpired = slaSeconds <= 0;

  // Ensure the modal always ranks strictly by dynamicDistanceKm
  const top3 = [...rankedHospitals]
    .sort((a, b) => (a.dynamicDistanceKm ?? Infinity) - (b.dynamicDistanceKm ?? Infinity))
    .slice(0, 3);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="holdModalTitle"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs"
    >
      <div className="bg-slate-950 text-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950 text-rose-300 font-bold text-xs border border-rose-800 mb-2">
              <span>2-MINUTE EMERGENCY HOLD</span>
              <span>•</span>
              <span>Patient: {patientInfo.patientName || 'Emergency Patient'}</span>
            </div>
            <h3 id="holdModalTitle" className="text-xl sm:text-2xl font-black text-white">
              {t.holdModalTitle}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Send the same request to the three nearest matching hospitals. When a hospital accepts, you choose which accepted offer to confirm.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div
              className={`px-4 py-2 rounded-2xl text-center border ${
                isExpired
                  ? 'bg-rose-950/80 border-rose-700'
                  : 'bg-emerald-950/80 border-emerald-700'
              }`}
            >
              <div
                className={`text-xs font-bold ${
                  isExpired ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {t.patientDecisionSla}
              </div>
              <div
                className={`text-2xl font-black font-mono ${
                  isExpired ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {formatTimer(slaSeconds)}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Expired SLA Banner */}
        {isExpired && (
          <div
            role="alert"
            className="px-6 py-3.5 bg-rose-950 border-b border-rose-800 text-rose-200 text-xs font-bold flex items-center justify-between gap-3 shrink-0"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Hold window expired, please search again.</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs cursor-pointer"
            >
              Search Again
            </button>
          </div>
        )}

        {/* Inline Error Banner on Reservation Failure */}
        {holdError && (
          <div
            role="alert"
            className="px-6 py-3.5 bg-rose-950 border-b border-rose-800 text-rose-200 text-xs font-bold flex items-center gap-2 shrink-0"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{holdError}</span>
          </div>
        )}

        {/* Payment mode choice bar */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{t.howWillYouPay}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedPaymentMode('Cashless Insurance / PM-JAY')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer min-h-[38px] ${
                selectedPaymentMode === 'Cashless Insurance / PM-JAY'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Cashless / PM-JAY
            </button>
            <button
              type="button"
              onClick={() => setSelectedPaymentMode('Self-Pay / Cash')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer min-h-[38px] ${
                selectedPaymentMode === 'Self-Pay / Cash'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Self-Pay / Cash
            </button>
          </div>
        </div>

        <div className="px-6 pt-5 shrink-0">
          {requestState === 'idle' ? (
            <button
              type="button"
              disabled={isExpired}
              onClick={sendRequestsToAllHospitals}
              className="w-full min-h-[48px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-5 text-sm font-extrabold text-white flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send request to all {top3.length} nearby hospitals
            </button>
          ) : (
            <div className="rounded-2xl border border-sky-900 bg-sky-950/60 px-4 py-3 text-sm text-sky-100 flex items-center gap-3">
              {acceptedCount > 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <Clock3 className="w-5 h-5 text-sky-300 shrink-0 animate-pulse" />}
              <span>
                {acceptedCount > 0
                  ? `${acceptedCount} hospital${acceptedCount > 1 ? 's have' : ' has'} accepted. Select one accepted hospital to confirm the bed.`
                  : 'Requests sent to all three hospitals. Waiting for their responses…'}
              </span>
            </div>
          )}
        </div>

        {/* 3 Hospital request and response cards */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {top3.map((hosp, idx) => {
            const isAccepted = acceptedCount > idx;
            const isPending = requestState !== 'idle' && !isAccepted;
            const distanceText =
              hosp.dynamicDistanceKm !== undefined
                ? `~${hosp.dynamicDistanceKm} km (straight line)`
                : 'distance unknown';

            return (
              <div
                key={hosp.id}
                className="bg-white text-slate-900 rounded-2xl p-4 border-2 border-emerald-500 shadow-md space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="relative h-28 w-full rounded-xl overflow-hidden bg-slate-900">
                    <img
                      src={hosp.imageUrl || `/assets/hospitals/${hosp.id}.jpg`}
                      alt={hosp.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=500&q=80';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
                    <span className="absolute bottom-2 left-2 text-[10px] font-black text-white px-2 py-0.5 rounded bg-slate-950/80 backdrop-blur-xs">
                      {hosp.isGovernment ? 'Govt Hospital' : 'Super Speciality'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Rank #{idx + 1} By Distance
                    </span>
                    <span className={`font-bold px-2 py-0.5 rounded-full flex items-center gap-1 text-[11px] ${isAccepted ? 'text-emerald-800 bg-emerald-100' : isPending ? 'text-amber-800 bg-amber-100' : 'text-slate-600 bg-slate-100'}`}>
                      {isAccepted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                      <span>{isAccepted ? (idx === 0 ? 'Accepted first' : 'Accepted') : isPending ? 'Request sent' : 'Ready to request'}</span>
                    </span>
                  </div>

                  <div>
                    <h4 className="font-black text-slate-900 text-base leading-tight">
                      {hosp.name}
                    </h4>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {distanceText} • {hosp.stationVicinity}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Reserved Bay:</span>
                      <strong className="text-slate-900">Emergency Bay #{idx + 1}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Emergency Phone:</span>
                      <a href={`tel:${hosp.phone}`} className="font-mono text-rose-600 font-bold hover:underline">
                        {hosp.phone}
                      </a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Billing:</span>
                      <span className="text-emerald-700 font-bold">
                        {hosp.acceptsInsurance ? 'PM-JAY & TPA Cashless' : 'Cash Billing'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isExpired || isHolding || !isAccepted}
                  onClick={() => onSelectFinalHospital(hosp, `Emergency Bay #${idx + 1}`)}
                  className="w-full py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] mt-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isExpired
                      ? 'Hold Window Expired'
                      : isHolding
                      ? 'Locking Bed…'
                      : !isAccepted
                      ? isPending ? 'Awaiting hospital response…' : 'Send requests first'
                      : `${t.confirmAndLock} ${hosp.name.split(' ')[0]}`}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Bottom notification */}
        <div className="p-4 bg-emerald-950/60 border-t border-slate-800 text-center text-xs text-emerald-300 flex items-center justify-center gap-2 shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {isExpired
              ? 'Hold window expired, please search again.'
              : requestState === 'idle'
              ? `Send this request to all ${top3.length} nearby hospitals at the same time.`
              : acceptedCount > 0
              ? `Patient choice required: confirm one of the ${acceptedCount} accepted hospital offers.`
              : `All ${top3.length} hospital requests are pending.`}
          </span>
        </div>
      </div>
    </div>
  );
};

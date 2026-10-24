import React, { useState, useEffect } from 'react';
import { AlertCircle, Ambulance, Building2, Car, CheckCircle2, X } from 'lucide-react';
import { PatientInfo, Hospital, EmergencyCase, BedCounts } from '../../types/bedlink';
import { TRANSLATIONS, LanguageCode } from '../../i18n/translations';
import { BedAvailabilityRadar } from './patient/BedAvailabilityRadar';
import { EmergencyTracker } from './patient/EmergencyTracker';
import { MultiHospitalHoldModal } from './patient/MultiHospitalHoldModal';
import { EmergencyCallBar } from '../common/EmergencyCallBar';
import { useLocation } from '../../hooks/useLocation';

interface PatientPortalViewProps {
  patientInfo: PatientInfo;
  hospitals: Hospital[];
  emergencyCase: EmergencyCase | null;
  activeTab: 'radar' | 'tracker';
  setActiveTab: (tab: 'radar' | 'tracker') => void;
  onConfirmBedReservation: (
    hospital: Hospital,
    bay: string,
    insuranceMode: string,
    bedType: keyof BedCounts,
    ambulanceService: 'hospital' | 'private' | 'none'
  ) => Promise<void>;
  onCancelHold: (caseId: string) => void;
  language: LanguageCode;
}

export const PatientPortalView: React.FC<PatientPortalViewProps> = ({
  patientInfo,
  hospitals,
  emergencyCase,
  activeTab,
  setActiveTab,
  onConfirmBedReservation,
  onCancelHold,
  language,
}) => {
  const t = TRANSLATIONS[language] || TRANSLATIONS.English;

  // Use the location hook initialized with patient's login station
  const location = useLocation(patientInfo.nearestStation || 'Bandra Station');

  // Emergency selection & bed type recommendation
  const [emergencyType, setEmergencyType] = useState('cardiac');
  const [requiredBedType, setRequiredBedType] = useState<keyof BedCounts>('icu');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'Cashless Insurance / PM-JAY' | 'Self-Pay / Cash'>(
    'Cashless Insurance / PM-JAY'
  );

  // Multi-hospital hold state
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [rankedListForModal, setRankedListForModal] = useState<Hospital[]>([]);
  const [slaSeconds, setSlaSeconds] = useState(120);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [isHoldingBed, setIsHoldingBed] = useState(false);
  const [ambulancePrompt, setAmbulancePrompt] = useState<{ hospital: Hospital; bay: string } | null>(null);

  // 2-minute SLA countdown timer
  useEffect(() => {
    let timer: any;
    if (isHoldModalOpen && slaSeconds > 0) {
      timer = setInterval(() => {
        setSlaSeconds((s) => Math.max(0, s - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isHoldModalOpen, slaSeconds]);

  // Show notice when 2-minute SLA countdown reaches 0
  useEffect(() => {
    if (isHoldModalOpen && slaSeconds === 0) {
      setHoldError('Hold window expired, please search again.');
    }
  }, [isHoldModalOpen, slaSeconds]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const handleOpenHoldModal = (ranked: Hospital[]) => {
    setHoldError(null);
    setRankedListForModal(ranked);
    setSlaSeconds(120);
    setIsHoldModalOpen(true);
  };

  const handleSelectFinalHospital = async (hospital: Hospital, bay: string) => {
    if (isHoldModalOpen && slaSeconds <= 0) {
      setHoldError('Hold window expired, please search again.');
      return;
    }
    setAmbulancePrompt({ hospital, bay });
  };

  const handleAmbulanceChoice = async (ambulanceService: 'hospital' | 'private' | 'none') => {
    if (!ambulancePrompt) return;
    const { hospital, bay } = ambulancePrompt;
    setHoldError(null);
    setIsHoldingBed(true);
    try {
      await onConfirmBedReservation(hospital, bay, selectedPaymentMode, requiredBedType, ambulanceService);
      setIsHoldModalOpen(false);
      setAmbulancePrompt(null);
      setActiveTab('tracker');
    } catch (err: any) {
      setHoldError(err?.message || 'Unable to reserve emergency bed. Please try another hospital.');
    } finally {
      setIsHoldingBed(false);
    }
  };

  return (
    <div className="space-y-6">
      {holdError && !isHoldModalOpen && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-900 font-bold"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{holdError}</span>
          </div>
          <button
            type="button"
            onClick={() => setHoldError(null)}
            aria-label="Dismiss error"
            className="p-1 text-rose-500 hover:text-rose-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === 'radar' && (
        <BedAvailabilityRadar
          selectedStation={location.selectedStationName}
          setSelectedStation={location.selectStationManually}
          userCoords={
            location.coords ||
            (patientInfo.userLat && patientInfo.userLng
              ? { lat: patientInfo.userLat, lng: patientInfo.userLng }
              : null)
          }
          locationSource={location.source}
          onRequestGps={location.requestGps}
          gpsLoading={location.isLoading}
          gpsStatusText={location.statusText}
          isOutsideArea={location.isOutsideArea}
          patientInfo={patientInfo}
          hospitals={hospitals}
          selectedPaymentMode={selectedPaymentMode}
          setSelectedPaymentMode={setSelectedPaymentMode}
          requiredBedType={requiredBedType}
          setRequiredBedType={setRequiredBedType}
          emergencyType={emergencyType}
          setEmergencyType={setEmergencyType}
          onOpenHoldModal={handleOpenHoldModal}
          onSelectFinalHospital={handleSelectFinalHospital}
          isHoldingBed={isHoldingBed}
          t={t}
        />
      )}

      {activeTab === 'tracker' && (
        <EmergencyTracker
          emergencyCase={emergencyCase}
          patientInfo={patientInfo}
          selectedPaymentMode={selectedPaymentMode}
          onCancelHold={onCancelHold}
          onGoToRadar={() => setActiveTab('radar')}
          t={t}
        />
      )}

      {/* Persistent Call 108 / Call 112 bar */}
      <EmergencyCallBar t={t} showDisclaimer={true} />

      {/* Multi-Hospital Hold Modal */}
      <MultiHospitalHoldModal
        isOpen={isHoldModalOpen}
        onClose={() => setIsHoldModalOpen(false)}
        patientInfo={patientInfo}
        slaSeconds={slaSeconds}
        formatTimer={formatTimer}
        selectedPaymentMode={selectedPaymentMode}
        setSelectedPaymentMode={setSelectedPaymentMode}
        rankedHospitals={rankedListForModal}
        onSelectFinalHospital={handleSelectFinalHospital}
        holdError={holdError}
        isHolding={isHoldingBed}
        t={t}
      />

      {ambulancePrompt && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="ambulance-title" className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-slate-950 px-6 py-5 text-white">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600">
                  <Ambulance className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-300">Bed selected</p>
                  <h2 id="ambulance-title" className="text-xl font-extrabold">Do you need an ambulance?</h2>
                  <p className="mt-1 text-sm text-slate-300">Your bed at {ambulancePrompt.hospital.name} will be reserved after your choice.</p>
                </div>
              </div>
            </div>
            <div className="space-y-3 p-6">
              <button type="button" disabled={isHoldingBed} onClick={() => handleAmbulanceChoice('none')} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><CheckCircle2 className="h-5 w-5" /></span>
                <span><span className="block font-bold text-slate-900">No, continue without ambulance</span><span className="block text-xs text-slate-500">Skip ambulance service and start the hospital tracker.</span></span>
              </button>
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <p className="mb-3 text-sm font-bold text-rose-950">Yes, I need an ambulance. Choose a service:</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" disabled={isHoldingBed} onClick={() => handleAmbulanceChoice('hospital')} className="rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-rose-100 transition hover:ring-rose-400 disabled:opacity-60"><Building2 className="mb-2 h-5 w-5 text-rose-600" /><span className="block text-sm font-bold text-slate-900">Hospital ambulance</span><span className="text-xs text-slate-500">Request the hospital’s ambulance.</span></button>
                  <button type="button" disabled={isHoldingBed} onClick={() => handleAmbulanceChoice('private')} className="rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-rose-100 transition hover:ring-rose-400 disabled:opacity-60"><Car className="mb-2 h-5 w-5 text-rose-600" /><span className="block text-sm font-bold text-slate-900">Private ambulance</span><span className="text-xs text-slate-500">Request a private ambulance service.</span></button>
                </div>
              </div>
              <button type="button" disabled={isHoldingBed} onClick={() => setAmbulancePrompt(null)} className="w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-800 disabled:opacity-60">Back to hospital selection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import FeedbackModal from './FeedbackModal';

const FeedbackButton: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-forest hover:bg-lime-400 text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        aria-label="Envoyer un feedback"
        title="Envoyer un feedback"
      >
        <MessageCircle size={24} strokeWidth={2.5} />
      </button>

      <FeedbackModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
};

export default FeedbackButton;

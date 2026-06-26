import React from 'react';
import { motion } from 'motion/react';

export function OrbitalLoader() {
  return (
    <div className="adl-orbital-loader">
      <motion.div
        className="adl-orbital-loader__ring adl-orbital-loader__ring--outer"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="adl-orbital-loader__ring adl-orbital-loader__ring--middle"
        animate={{ rotate: -360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="adl-orbital-loader__ring adl-orbital-loader__ring--inner"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

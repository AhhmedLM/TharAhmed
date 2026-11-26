/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RTSClientInstance } from './components/RTSClientInstance';

export default function App() {
  const [splitScreenMultiplayer, setSplitScreenMultiplayer] = useState(false);

  return (
    <main className="w-screen h-dvh overflow-hidden bg-[#0f1419] flex flex-col md:flex-row">
      <div className={splitScreenMultiplayer ? 'w-full md:w-1/2 h-1/2 md:h-full border-b md:border-b-0 md:border-l border-slate-700' : 'w-full h-full'}>
        <ErrorBoundary>
          <RTSClientInstance
            clientLabel="القائد الأول"
            isSplitView={splitScreenMultiplayer}
            onToggleSplitView={() => setSplitScreenMultiplayer((prev) => !prev)}
          />
        </ErrorBoundary>
      </div>

      {splitScreenMultiplayer && (
        <div className="w-full md:w-1/2 h-1/2 md:h-full">
          <ErrorBoundary>
            <RTSClientInstance
              clientLabel="القائد الثاني"
              isSplitView={splitScreenMultiplayer}
              onToggleSplitView={() => setSplitScreenMultiplayer(false)}
            />
          </ErrorBoundary>
        </div>
      )}
    </main>
  );
}

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'حدث خطأ غير متوقع في واجهة اللعبة',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Thar Ahmed UI ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="w-full h-full flex flex-col items-center justify-center bg-[#120c07] text-[#fde68a] p-6 text-center gap-4"
        >
          <div className="max-w-md border-2 border-[#a87c39] bg-[#1d140c] p-6 shadow-2xl space-y-3">
            <h2 className="text-lg font-extrabold text-[#fef08a]">
              تعثر مؤقت في عرض ساحة ثار أحمد
            </h2>
            <p className="text-xs text-[#d6c29f] leading-relaxed">
              واجهت الواجهة خطأ تقنياً وتم إيقاف الجزء المتعطل بأمان لحماية جلستك.
            </p>
            <div className="text-[11px] font-mono bg-black/40 border border-[#5c4020] p-2 text-rose-300 break-words">
              {this.state.message}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rts2k-bevel-btn-gold text-xs font-bold cursor-pointer"
            >
              إعادة تحميل اللعبة واستكمال المعركة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const state = {
  pdfDocument: null,
  isBeamerSplitMode: false,
  isGDocsSplitMode: false,
  gDocsSlideRect: null,
  currentPage: 1,
  totalPages: 0,
  activeRenderTask: null,
  hasRequestedFullscreen: false,
  breakTimerId: null,
  breakStartTime: null,
  breakDuration: 0,
  isZoomed: false,
  canvasOrigRect: null,
  progressBarVisible: true
};

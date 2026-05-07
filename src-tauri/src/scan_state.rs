use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64};

pub struct ScanState {
    pub cancel: Arc<AtomicBool>,
    pub counter: Arc<AtomicU64>,
}

impl Default for ScanState {
    fn default() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            counter: Arc::new(AtomicU64::new(0)),
        }
    }
}

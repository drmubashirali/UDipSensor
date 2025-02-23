Page({
  data: {},

  // Navigate to Calibration page
  goToCalibration() {
    wx.navigateTo({
      url: "/pages/calibration/calibration", // Path to Calibration page
    });
  },

  // Navigate to Detection page
  goToDetection() {
    wx.navigateTo({
      url: "/pages/detection/detection", // Path to Detection page
    });
  },

  onSavedData() {
    wx.navigateTo({
      url: "/pages/savedData/savedData", // Path to Saved Data page
    });
  },
});

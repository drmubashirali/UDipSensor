Page({
  data: {
    rowData: [] as { refPic: string; reacPic: string; value: string }[], // Data rows
    scanButtonLabel: "Scan", // Text for the Scan button
    currentRefPic: "", // Stores the reference picture
    currentReacPic: "", // Stores the reaction picture
    step: 1, // Current step: 1=Ref Pic, 2=Reac Pic, 3=Add Calibration Value
    tempImagePath: "", // Temporarily stores image path
  },

  // Scan button handler
  handleScan() {
    const { step } = this.data;
    const type = step === 1 ? "Ref Pic" : "Reac Pic";
    this.showSelectionDialog(type);
  },

  // Show selection dialog for Camera or Gallery
  showSelectionDialog(type: string) {
    const self = this;
    wx.showActionSheet({
      itemList: ["Camera", "Gallery"],
      success(res) {
        const sourceType = res.tapIndex === 0 ? "camera" : "album";
        self.chooseImage(sourceType, type);
      },
    });
  },

  // Choose an image from camera or gallery
  chooseImage(sourceType: "camera" | "album", type: string) {
    const self = this;
    wx.chooseImage({
      count: 1,
      sourceType: [sourceType],
      success(res) {
        const tempFilePath = res.tempFilePaths[0];
        self.setData({ tempImagePath: tempFilePath }); // Store image temporarily
        self.openImageEditor(self.data.tempImagePath, type); // Directly go to crop options
      },
    });
  },

  // Open the image editor for cropping
  openImageEditor(imagePath: string, type: string) {
    const self = this;
    wx.editImage({
      src: imagePath, // The image that needs to be cropped
      success(res) {
        // When cropping is complete, the result will be in `res.tempFilePath`
        self.handleCroppedImage(res.tempFilePath, type); // Proceed with the cropped image
      },
      fail(err) {
        wx.showToast({
          title: 'Image editing failed',
          icon: 'none',
        });
      },
    });
  },

  // Handle the image (after cropping or accepting the image)
  handleCroppedImage(filePath: string, type: string) {
    const self = this;

    if (type === "Ref Pic") {
      self.setData({
        currentRefPic: filePath,
        scanButtonLabel: "Scan",
        step: 2, // Move to Reac Pic step
      });

      // Show success toast for Ref Pic
      wx.showToast({
        title: "Now Scan Final Picture!",
        icon: "success",
        duration: 2000,
      });

    } else if (type === "Reac Pic") {
      self.setData({
        currentReacPic: filePath,
        step: 3, // Move to Add Calibration Value step
      });

      // Show success toast for Reac Pic
      wx.showToast({
        title: "Picture Taken!",
        icon: "success",
        duration: 1000,
      });

      self.addCalibrationValue(); // Prompt for calibration value
    }
  },

  // Add calibration value
  addCalibrationValue() {
    const self = this;
    wx.showModal({
      title: "Enter Calibration Value",
      editable: true,
      placeholderText: "Enter C value (e.g., 0.50)",
      success(res) {
        if (res.confirm && res.content) {
          const { rowData, currentRefPic, currentReacPic } = self.data;

          // Add new record to rowData
          const newRow = {
            refPic: currentRefPic,
            reacPic: currentReacPic,
            value: res.content, // User-entered calibration value
          };

          // Reset for the next record and update the rowData
          self.setData({
            rowData: [...rowData, newRow],
            scanButtonLabel: "Scan", // Reset button label
            currentRefPic: "",
            currentReacPic: "",
            step: 1, // Reset to first step
          });

          // Show a success message
          wx.showToast({ title: "Record Taken!", icon: "success" });
        }
      },
    });
  },

  // Perform analysis
  performAnalysis() {
    const { rowData } = this.data;

    const analysisPromises = rowData.map(async (row, index) => {
      try {
        const refRValue = await this.calculateRedMeanValue(row.refPic); // R-value for Ref Pic
        const reacRValue = await this.calculateRedMeanValue(row.reacPic); // R-value for Reac Pic
        const deltaR = refRValue - reacRValue; // ΔR = Reac R-value - Ref R-value

        return {
          SN: index + 1, // Sequence Number
          refRValue,
          reacRValue,
          deltaR, // Change in Red Mean value
          calibrationValue: row.value, // Calibration value
        };
      } catch (err) {
        console.error(`Error analyzing image for row ${index + 1}:`, err);
        return null;
      }
    });

    Promise.all(analysisPromises).then((analysisData) => {
      const validData = analysisData.filter((data) => data !== null); // Exclude failed rows

      wx.navigateTo({
        url: "/pages/analysis/analysis", // Analysis page URL
        success: (res) => {
          res.eventChannel.emit("sendAnalysisData", { analysisData: validData });
        },
      });
    });
  },

  // Calculate Red Mean Value from an image
  calculateRedMeanValue(imagePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();

      // Create a canvas dynamically to perform image processing
      query
        .select("#analysisCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res[0].node;
          const ctx = canvas.getContext("2d");

          // Disable image smoothing to avoid interpolation artifacts
          ctx.imageSmoothingEnabled = false;
          if (ctx.webkitImageSmoothingEnabled !== undefined) {
            ctx.webkitImageSmoothingEnabled = false;
          }
          if (ctx.mozImageSmoothingEnabled !== undefined) {
            ctx.mozImageSmoothingEnabled = false;
          }

          const img = canvas.createImage();
          img.src = imagePath;

          img.onload = () => {
            const { width, height } = img;

            // Set canvas dimensions to match the image's native dimensions
            canvas.width = width;
            canvas.height = height;

            // Clear any existing content on the canvas
            ctx.clearRect(0, 0, width, height);

            // Draw the image on the canvas
            ctx.drawImage(img, 0, 0, width, height);

            // Retrieve the image data from the canvas
            const imageData = ctx.getImageData(0, 0, width, height).data;

            let totalRed = 0;
            let pixelCount = 0;

            // Loop through the pixel data and sum up the red channel values
            for (let i = 0; i < imageData.length; i += 4) {
              const red = imageData[i]; // red channel
              totalRed += red;
              pixelCount++;
            }

            // Compute the mean red value
            const meanRed = totalRed / pixelCount;
            resolve(meanRed);
          };

          img.onerror = () => {
            reject("Image loading failed");
          };
        });
    });
  },

  // Abort and go back to the home page
  abortCalibration() {
    wx.navigateTo({
      url: "/pages/index/index",
    });
  },
});

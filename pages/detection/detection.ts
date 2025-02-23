Page({
  data: {
    linearEquation: "", // Linear equation from calibration
    rValue: "", // R-value from calibration
    isCalibrationDataVisible: false, // Tracks visibility of calibration data
    currentRefPic: "", // Stores the reference picture
    currentReacPic: "", // Stores the reaction picture
    scanButtonLabel: "Scan", // Text for the Scan button
    deltaR: null as number | null, // ΔR value
    step: 1, // Current step: 1=Ref Pic, 2=Reac Pic
    detectionResult: null as number | null, // Blood glucose detection result
    isDetectionComplete: false, // Whether detection is complete
    showActionButtons: false, // Controls visibility of the Abort and Save buttons
  },

  onLoad() {
    console.log("Page loaded.");
    const eventChannel = this.getOpenerEventChannel();

    // Receive calibration data from the previous page
    eventChannel.on("sendCalibrationData", (data: { linearEquation: string; rValue: string }) => {
      console.log("Received calibration data:", data);
      const { linearEquation, rValue } = data;

      wx.setStorageSync("linearEquation", linearEquation);
      wx.setStorageSync("rValue", rValue);

      this.setData({
        linearEquation,
        rValue,
      });
    });

    const storedEquation = wx.getStorageSync("linearEquation");
    const storedRValue = wx.getStorageSync("rValue");

    console.log("Loaded stored calibration data:", {
      storedEquation,
      storedRValue,
    });

    if (storedEquation && storedRValue) {
      this.setData({
        linearEquation: storedEquation,
        rValue: storedRValue,
      });
    }
  },

  toggleCalibrationData() {
    console.log("Toggling calibration data visibility.");
    this.setData({
      isCalibrationDataVisible: !this.data.isCalibrationDataVisible,
    });
  },

  handleScan() {
    const { step } = this.data;
    const type: "Ref Pic" | "Reac Pic" = step === 1 ? "Ref Pic" : "Reac Pic";
    console.log(`Handling scan for: ${type}`);
    this.showSelectionDialog(type);
  },

  showSelectionDialog(type: "Ref Pic" | "Reac Pic") {
    console.log(`Showing selection dialog for: ${type}`);
    wx.showActionSheet({
      itemList: ["Camera", "Gallery"],
      success: (res: { tapIndex: number }) => {
        const sourceType: "camera" | "album" = res.tapIndex === 0 ? "camera" : "album";
        console.log(`User selected sourceType: ${sourceType}`);
        this.chooseImage(sourceType, type);
      },
      fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
        console.error("Error in showing selection dialog:", err);
      },
    });
  },

  chooseImage(sourceType: "camera" | "album", type: "Ref Pic" | "Reac Pic") {
    console.log(`Choosing image from source: ${sourceType} for type: ${type}`);
    wx.chooseImage({
      count: 1,
      sourceType: [sourceType],
      success: (res: { tempFilePaths: string[] }) => {
        const tempFilePath = res.tempFilePaths[0];
        console.log(`Image chosen successfully. Path: ${tempFilePath}`);
        this.openImageEditor(tempFilePath, type); // Directly open crop editor
      },
      fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
        console.error("Error in choosing image:", err);
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
        self.handleImage(res.tempFilePath, type); // Proceed with the cropped image
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
  handleImage(filePath: string, type: "Ref Pic" | "Reac Pic") {
    console.log(`Handling image for ${type}. File path: ${filePath}`);
    if (type === "Ref Pic") {
      this.setData({
        currentRefPic: filePath,
        scanButtonLabel: "Scan",
        step: 2,
      });

      wx.showToast({
        title: "Reference Picture Taken!",
        icon: "success",
      });
    } else if (type === "Reac Pic") {
      this.setData({
        currentReacPic: filePath,
        scanButtonLabel: "Scan",
        step: 1,
      });

      wx.showToast({
        title: "Reaction Picture Taken!",
        icon: "success",
      });
    }
  },

  async onDetect() {
    const { currentRefPic, currentReacPic, linearEquation } = this.data;

    console.log("Starting detection process...");
    console.log("Reference Picture Path:", currentRefPic);
    console.log("Reaction Picture Path:", currentReacPic);
    console.log("Linear Equation:", linearEquation);

    if (!currentRefPic || !currentReacPic) {
      wx.showToast({
        title: "Please take both pictures first!",
        icon: "none",
      });
      return;
    }

    if (!linearEquation) {
      wx.showToast({
        title: "No calibration data found!",
        icon: "none",
      });
      return;
    }

    try {
      const refRValue = await this.calculateRedMeanValue(currentRefPic);
      const reacRValue = await this.calculateRedMeanValue(currentReacPic);

      if (isNaN(refRValue) || isNaN(reacRValue)) {
        throw new Error("Invalid red mean values calculated.");
      }

      const deltaR = refRValue - reacRValue;

      const [slope, intercept] = linearEquation
        .replace("y = ", "")
        .split("x + ")
        .map((value) => parseFloat(value));

      if (isNaN(slope) || isNaN(intercept)) {
        throw new Error("Invalid linear equation format.");
      }

      const detectionResult = (deltaR - intercept) / slope;

      this.setData({
        deltaR: parseFloat(deltaR.toFixed(2)),
        detectionResult: parseFloat(detectionResult.toFixed(2)),
        isDetectionComplete: true,
        showActionButtons: true,
      });

      wx.showToast({
        title: `BG Value: ${detectionResult.toFixed(2)}`,
        icon: "success",
      });
    } catch (error) {
      console.error("Error during detection:", (error as Error).message);
      wx.showToast({
        title: `Error during detection! ${(error as Error).message}`,
        icon: "none",
      });
    }
  },

  calculateRedMeanValue(imagePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();

      query
        .select("#analysisCanvas")
        .fields({ node: true, size: true }) // Request the canvas node and its size
        .exec((res: any) => {
          if (!res[0] || !res[0].node) {
            console.error("Canvas node not found.");
            reject(new Error("Canvas node not found."));
            return;
          }

          const canvas = res[0].node as WechatMiniprogram.Canvas; // Properly cast to Canvas
          const ctx = canvas.getContext("2d")!;
          const img = canvas.createImage();
          img.src = imagePath;

          img.onload = () => {
            const { width, height } = img;
            canvas.width = width;
            canvas.height = height;

            ctx.drawImage(img, 0, 0, width, height);

            const imageData = ctx.getImageData(0, 0, width, height).data;

            let totalRed = 0;
            let pixelCount = 0;

            for (let i = 0; i < imageData.length; i += 4) {
              totalRed += imageData[i]; // Red channel
              pixelCount++;
            }

            const meanRed = totalRed / pixelCount;
            resolve(meanRed);
          };

          img.onerror = () => {
            reject(new Error("Image loading failed."));
          };
        });
    });
  },

  saveResult() {
    const { detectionResult } = this.data;

    if (detectionResult === null) {
      wx.showToast({
        title: "No result to save!",
        icon: "none",
      });
      return;
    }

    // Get the current date and time
    const now = new Date();
    const currentTime = now.toLocaleTimeString();
    const currentDate = now.toLocaleDateString();

    // Create a new record
    const newRecord = {
      srNo: 1, // Default Sr#; will be adjusted later
      glucose: detectionResult,
      time: currentTime,
      date: currentDate,
    };

    // Retrieve the existing records from local storage
    wx.getStorage({
      key: "bgResults",
      success: (res) => {
        const records = res.data || [];
        // Update Sr# for the new record
        newRecord.srNo = records.length + 1;

        // Add the new record to the list
        records.push(newRecord);

        // Save the updated list back to local storage
        wx.setStorage({
          key: "bgResults",
          data: records,
          success: () => {
            wx.showToast({
              title: "Result Saved!",
              icon: "success",
            });
          },
          fail: (err) => {
            console.error("Failed to save result:", err);
          },
        });
      },
      fail: () => {
        // If no existing records, save the new record as the first entry
        wx.setStorage({
          key: "bgResults",
          data: [newRecord],
          success: () => {
            wx.showToast({
              title: "Result Saved!",
              icon: "success",
            });
          },
          fail: (err) => {
            console.error("Failed to save result:", err);
          },
        });
      },
    });
  },

  abortDetection() {
    wx.navigateTo({
      url: "/pages/index/index",
    });
  },
});

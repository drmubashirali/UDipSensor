Page({
  data: {
    analysisData: [] as {
      SN: number;
      refRValue: number;
      reacRValue: number;
      deltaR: number;
      calibrationValue: string;
    }[],
    linearEquation: "", // Stores the linear equation
    rValue: 0, // Stores the R-value
  },

  onLoad() {
    const self = this;
    const eventChannel = this.getOpenerEventChannel();

    // Receive data from calibration page
    eventChannel.on("sendAnalysisData", function (data) {
      const formattedData = data.analysisData.map((item) => ({
        SN: item.SN,
        refRValue: Math.round(item.refRValue),
        reacRValue: Math.round(item.reacRValue),
        deltaR: Math.round(item.deltaR),
        calibrationValue: parseFloat(item.calibrationValue), // Convert to number
      }));

      self.setData({
        analysisData: formattedData,
      });

      // Plot the graph and calculate the linear equation
      self.plotGraph(formattedData);
    });
  },

  // Plot the graph with x and y-axis labels
  plotGraph(analysisData: { deltaR: number; calibrationValue: number }[]) {
    const ctx = wx.createCanvasContext("analysisGraph");

    // Sort data by calibration value
    const sortedData = analysisData.sort((a, b) => a.calibrationValue - b.calibrationValue);

    const xValues = sortedData.map((item) => item.calibrationValue); // Concentration
    const yValues = sortedData.map((item) => item.deltaR); // ΔR

    const maxX = Math.max(...xValues);
    const maxY = Math.max(...yValues);
    const minX = Math.min(...xValues);
    const minY = Math.min(...yValues);

    // Increase left padding to leave room for the y-axis label
    const padding = 70;  
    const canvasWidth = 350;
    const canvasHeight = 350;

    const graphWidth = canvasWidth - 2 * padding;
    const graphHeight = canvasHeight - 2 * padding;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw axes
    ctx.setStrokeStyle("#000");
    ctx.setLineWidth(1);

    // Draw x-axis (bottom)
    ctx.beginPath();
    ctx.moveTo(padding, canvasHeight - padding);
    ctx.lineTo(canvasWidth - padding, canvasHeight - padding);
    ctx.stroke();

    // Draw y-axis (left)
    ctx.beginPath();
    ctx.moveTo(padding, canvasHeight - padding);
    ctx.lineTo(padding, padding);
    ctx.stroke();

    // Label x-axis tick values (normal style)
    ctx.font = "bold 12px Arial";
    ctx.setFillStyle("#000");
    for (let i = 0; i <= 5; i++) {
      const xValue = minX + (i * (maxX - minX)) / 5;
      const xPos = padding + (xValue / maxX) * graphWidth;
      ctx.fillText(xValue.toFixed(1), xPos - 10, canvasHeight - padding + 20);
    }

    // Center and bold the x-axis label
    ctx.font = "bold 14px Arial";
    const xLabel = "[Glucose] (mmol/L)";
    const xLabelWidth = ctx.measureText(xLabel).width;
    ctx.fillText(xLabel, canvasWidth / 2 - xLabelWidth / 2, canvasHeight - padding + 40);

    // Label y-axis tick values (normal style)
    ctx.font = "bold 12px Arial";
    for (let i = 0; i <= 5; i++) {
      const yValue = minY + (i * (maxY - minY)) / 5;
      const yPos = canvasHeight - padding - (yValue / maxY) * graphHeight;
      // Tick labels remain at padding - 35
      ctx.fillText(yValue.toFixed(1), padding - 35, yPos + 5);
    }

    // Draw rotated y-axis label "Signal Change (ΔR)" centered along the y-axis
    ctx.save();
    ctx.font = "bold 14px Arial";
    const yLabel = "Signal Change (ΔR)";
    const yLabelWidth = ctx.measureText(yLabel).width;
    // Translate left enough so that the label doesn't overlap the tick labels.
    // With padding=70, we translate to (70 - 50, canvasHeight/2) = (20, canvasHeight/2)
    ctx.translate(padding - 50, canvasHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, -yLabelWidth / 2, 0);
    ctx.restore();

    // Plot data points
    ctx.setFillStyle("#ff4d4f");
    for (let i = 0; i < xValues.length; i++) {
      const xPos = padding + (xValues[i] / maxX) * graphWidth;
      const yPos = canvasHeight - padding - (yValues[i] / maxY) * graphHeight;
      ctx.beginPath();
      ctx.arc(xPos, yPos, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Perform linear regression and draw the regression line
    const { slope, intercept, rValue } = this.performLinearRegression(xValues, yValues);
    this.setData({
      linearEquation: `y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}`,
      rValue: rValue.toFixed(4),
    });

    // Calculate start and end points for the regression line
    const startX = padding;
    const startY = canvasHeight - padding - ((slope * minX + intercept) / maxY) * graphHeight;
    const endX = canvasWidth - padding;
    const endY = canvasHeight - padding - ((slope * maxX + intercept) / maxY) * graphHeight;

    // Draw regression line in red color
    ctx.setStrokeStyle("red");
    ctx.setLineWidth(2);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.draw();
  },

  performLinearRegression(x: number[], y: number[]) {
    const n = x.length;
    const meanX = x.reduce((sum, value) => sum + value, 0) / n;
    const meanY = y.reduce((sum, value) => sum + value, 0) / n;
  
    let numerator = 0;
    let denominator = 0;
  
    // First loop: compute numerator and denominator for the slope
    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (y[i] - meanY);
      denominator += (x[i] - meanX) ** 2;
    }
  
    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;
  
    let ssTotal = 0;
    let ssResidual = 0;
  
    // Second loop: compute the sum of squares using the final slope and intercept
    for (let i = 0; i < n; i++) {
      const predictedY = slope * x[i] + intercept;
      ssTotal += (y[i] - meanY) ** 2;
      ssResidual += (y[i] - predictedY) ** 2;
    }
  
    const rValue = 1 - ssResidual / ssTotal;
  
    return { slope, intercept, rValue };
  },  

  // Navigate to the detection page with linear equation and R-value
  calibrateFunction() {
    const { linearEquation, rValue } = this.data;

    wx.navigateTo({
      url: "/pages/detection/detection",
      success: (res) => {
        res.eventChannel.emit("sendCalibrationData", { linearEquation, rValue });
      },
    });
  },

  abortAnalysis() {
    wx.navigateTo({
      url: "/pages/index/index",
    });
  },


});

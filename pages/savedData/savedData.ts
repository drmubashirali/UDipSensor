Page({
  data: {
    savedData: [] as { srNo: number; glucose: number; time: string; date: string }[],
  },

  // Helper function to reformat a date from dd/mm/yyyy to dd/mm/yy
  formatDate(dateStr: string): string {
    const parts = dateStr.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      parts[2] = parts[2].slice(-2); // Retain only the last two digits of the year
    }
    return parts.join("/");
  },

  // Helper function to convert a time string from 12-hour format with AM/PM to 24-hour format.
  // If the time is already in 24-hour format, it returns it unchanged.
  convertTo24Hour(timeStr: string): string {
    const trimmed = timeStr.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let hours = Number(match[1]);
      const minutes = match[2];
      const seconds = match[3];
      const period = match[4].toUpperCase();

      if (period === "PM" && hours < 12) {
        hours += 12;
      } else if (period === "AM" && hours === 12) {
        hours = 0;
      }
      const hoursStr = hours < 10 ? "0" + hours : hours.toString();
      return `${hoursStr}:${minutes}:${seconds}`;
    }
    // Assume it's already in 24-hour format if no AM/PM found
    return timeStr;
  },

  // Helper function to parse the time string (in 24-hour format) into total minutes since midnight.
  parseTime(timeStr: string): number {
    const time24 = this.convertTo24Hour(timeStr);
    const [hours, minutes] = time24.split(":").map(Number);
    return hours * 60 + minutes;
  },

  // For consistency, formatTime simply calls convertTo24Hour.
  formatTime(timeStr: string): string {
    return this.convertTo24Hour(timeStr);
  },

  // Helper function to convert a dd/mm/yyyy string into a Date object.
  parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  },

  onLoad() {
    // Retrieve saved data from local storage
    wx.getStorage({
      key: "bgResults",
      success: (res) => {
        const data = res.data || [];

        // Sort the data: first by date (descending) and then by time (descending)
        const sortedData = data.sort((a, b) => {
          const dateComparison =
            this.parseDate(b.date).getTime() - this.parseDate(a.date).getTime();
          if (dateComparison !== 0) {
            return dateComparison;
          }
          // Compare times using the 24-hour converted values
          return this.parseTime(b.time) - this.parseTime(a.time);
        });

        // Retain only the 10 most recent records
        const limitedData = sortedData.slice(0, 10);

        // Update each record with a serial number and convert date/time formats
        const updatedData = limitedData.map((item, index) => ({
          ...item,
          srNo: index + 1,
          date: this.formatDate(item.date),
          time: this.formatTime(item.time), // Ensure time is in 24-hour format
        }));

        // Save the updated records back to storage
        wx.setStorage({
          key: "bgResults",
          data: updatedData,
        });

        // Update the page data to display the 10 most recent records
        this.setData({
          savedData: updatedData,
        });
      },
      fail: () => {
        wx.showToast({
          title: "No saved data found.",
          icon: "none",
        });
      },
    });
  },

  delLast() {
    // Retrieve the saved data from local storage
    wx.getStorage({
      key: "bgResults",
      success: (res) => {
        const data = res.data || [];
        // Remove the last record from the array
        data.pop();

        // Save the updated list back to local storage
        wx.setStorage({
          key: "bgResults",
          data: data,
          success: () => {
            // Reassign SR# and reformat the date and time for each record
            const formattedData = data.map((item, index) => ({
              ...item,
              srNo: index + 1,
              date: this.formatDate(item.date),
              time: this.formatTime(item.time), // Ensure time is in 24-hour format
            }));
            this.setData({
              savedData: formattedData,
            });
            wx.showToast({
              title: "Last entry deleted!",
              icon: "success",
            });
          },
          fail: (err) => {
            wx.showToast({
              title: "Failed to update records",
              icon: "none",
            });
            console.error("Error updating records:", err);
          },
        });
      },
      fail: () => {
        wx.showToast({
          title: "No data to delete",
          icon: "none",
        });
      },
    });
  },

  // Navigate back to the index page
  abortToIndex() {
    wx.navigateTo({
      url: "/pages/index/index",
    });
  },
});

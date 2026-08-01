/** Discover hides titles that are already fully or partially in the library. */
export const shouldHideAvailableMediaItem = (item = {}) => {
    const status = Number(item?.mediaInfo?.status ?? item?.status);
    return status === 4 || status === 5;
};

export const filterAvailableMedia = (items = []) => (
    Array.isArray(items) ? items.filter((item) => !shouldHideAvailableMediaItem(item)) : []
);

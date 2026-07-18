export const createClientIdState = (initialClientId) => {
    let CLIENT_ID = initialClientId;
    const getClientId = () => CLIENT_ID;
    const setClientId = (value) => {
        CLIENT_ID = value;
    };
    return { getClientId, setClientId };
};

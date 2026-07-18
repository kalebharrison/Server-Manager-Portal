/** Pin HS256 so verify rejects unexpected alg headers. */
export const SESSION_JWT_ALGORITHMS = Object.freeze(['HS256']);

export const signSessionJwt = (jwt, payload, secret, options = {}) => (
    jwt.sign(payload, secret, { ...options, algorithm: 'HS256' })
);

export const verifySessionJwt = (jwt, token, secret) => (
    jwt.verify(token, secret, { algorithms: SESSION_JWT_ALGORITHMS })
);

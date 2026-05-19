import * as jwt from 'jsonwebtoken';

const generateToken = (id: string): string =>
  jwt.sign({ user: { id } }, process.env.JWT_SECRET || 'superSecret', {
    expiresIn: '60d',
  });

export default generateToken;

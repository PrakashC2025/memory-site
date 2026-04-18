import React, { createContext, useContext, useState } from 'react';
import type { User } from '../data/memories';

interface UserContextType {
  user: User | null;
  setUser: (u: User | null) => void;
  isMusicOn: boolean;
  setMusicOn: (v: boolean) => void;
  currentTrack: number;
  setCurrentTrack: (n: number) => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  isMusicOn: false,
  setMusicOn: () => {},
  currentTrack: 0,
  setCurrentTrack: () => {},
});

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isMusicOn, setMusicOn] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);

  return (
    <UserContext.Provider value={{ user, setUser, isMusicOn, setMusicOn, currentTrack, setCurrentTrack }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);

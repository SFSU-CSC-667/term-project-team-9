DROP TABLE IF EXISTS Users;
CREATE TABLE IF NOT EXISTS Users
(
    UserId SERIAL PRIMARY KEY,
    FirstName VARCHAR (255),
    LastName VARCHAR (255),
    Email VARCHAR (255) UNIQUE,
    Password VARCHAR (255),
    Chips INTEGER,
    Avatar BLOB
);
INSERT INTO Users (FirstName, LastName, Email, Password, Chips)
VALUES ('Poker', 'Dealer', 'team9@mail.sfsu.edu', '987654', '0');

DROP TABLE IF EXISTS Games;
CREATE TABLE IF NOT EXISTS Games
(
    GameId SERIAL PRIMARY KEY,
    MaxPlayers INTEGER,
    MinBid INTEGER,
    MinChips INTEGER,
    SeatsTaken INTEGER,
    Turn INTEGER
);

DROP TABLE IF EXISTS Players;
CREATE TABLE IF NOT EXISTS Players
(
    GameId INTEGER REFERENCES Games(GameId),
    UserId INTEGER REFERENCES Users(UserId),
    Bid INTEGER,
    BuyIn INTEGER,
    NetGain INTEGER,
    IsPlaying BOOLEAN,
    SeatNumber INTEGER
);

DROP TABLE IF EXISTS PlayersCards;
CREATE TABLE IF NOT EXISTS PlayersCards
(
    GameId INTEGER REFERENCES Games(GameId),
    UserId INTEGER REFERENCES Users(UserId),
    FlopCard1 INTEGER REFERENCES Deck(CardId),
    FlopCard2 INTEGER REFERENCES Deck(CardId),
    FlopCard3 INTEGER REFERENCES Deck(CardId),
    TurnCard INTEGER REFERENCES Deck(CardId),
    RiverCard INTEGER REFERENCES Deck(CardId)
);

DROP TABLE IF EXISTS PlayersActions;
CREATE TABLE IF NOT EXISTS PlayersActions
(
    GameId INTEGER REFERENCES Games(GameId),
    UserId INTEGER REFERENCES Users(UserId),
    IsAllIn BOOLEAN,
    IsCall BOOLEAN,
    IsCheck BOOLEAN,
    IsFold BOOLEAN,
    IsRaise BOOLEAN
)

DROP TABLE IF EXISTS SidePots;
CREATE TABLE IF NOT EXISTS SidePots
(
    GameId SERIAL PRIMARY KEY,
    SidePot1 INTEGER,
    SidePot2 INTEGER
);

DROP TABLE IF EXISTS Deck;
CREATE TABLE IF NOT EXISTS Deck
(
    CardId SERIAL PRIMARY KEY,
    CardName VARCHAR (255),
    CardImage BLOB
);
INSERT INTO Deck (CardName) VALUES
('Club A'), ('Club 2'), ('Club 3'), ('Club 4'), ('Club 5'), ('Club 6'), ('Club 7'), ('Club 8'), ('Club 9'), ('Club 10'), ('Club J'), ('Club Q'), ('Club K'),
('Diamond A'), ('Diamond 2'), ('Diamond 3'), ('Diamond 4'), ('Diamond 5'), ('Diamond 6'), ('Diamond 7'), ('Diamond 8'), ('Diamond 9'), ('Diamond 10'), ('Diamond J'), ('Diamond Q'), ('Diamond K'),
('Heart A'), ('Heart 2'), ('Heart 3'), ('Heart 4'), ('Heart 5'), ('Heart 6'), ('Heart 7'), ('Heart 8'), ('Heart 9'), ('Heart 10'), ('Heart J'), ('Heart Q'), ('Heart K'),
('Spade A'), ('Spade 2'), ('Spade 3'), ('Spade 4'), ('Spade 5'), ('Spade 6'), ('Spade 7'), ('Spade 8'), ('Spade 9'), ('Spade 10'), ('Spade J'), ('Spade Q'), ('Spade K');

import axios from 'axios';

const API = axios.create({
    baseURL: 'http://localhost:8080/api',
});

export const fetchTeams = () => API.get('/teams');
export const createTeam = (newTeam) => API.post('/teams', newTeam);